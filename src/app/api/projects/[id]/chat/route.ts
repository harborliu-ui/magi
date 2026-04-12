import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/error-logger';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import {
  ANALYSIS_CHAT_SYSTEM_PROMPT, buildAnalysisChatUserPrompt,
  HLD_SECTION_CHAT_SYSTEM_PROMPT, buildHLDSectionChatUserPrompt,
} from '@/lib/prompts';
import { safeJsonParse } from '@/lib/json-repair';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

const HLD_SECTION_KEYS: Record<string, { content: string; diagram: string; label: string }> = {
  information_architecture: { content: 'information_architecture', diagram: 'ia_diagram', label: '信息架构' },
  system_architecture: { content: 'system_architecture', diagram: 'sa_diagram', label: '系统架构' },
  data_architecture: { content: 'data_architecture', diagram: 'da_diagram', label: '数据架构' },
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const phase = params.get('phase') || 'analysis';
  const section = params.get('section') || '';

  let query = 'SELECT * FROM chat_messages WHERE project_id = ? AND phase = ?';
  const args: string[] = [id, phase];
  if (section) {
    query += ' AND section = ?';
    args.push(section);
  }
  query += ' ORDER BY created_at ASC';

  const messages = getDb().prepare(query).all(...args);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { phase, message, section } = body as { phase: 'analysis' | 'hld' | 'prd'; message: string; section?: string };
  const dryRun = body.dry_run === true;

  if (!message?.trim()) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
  }

  const db = getDb();
  const sectionVal = section || '';

  const userMsgId = uuid();
  db.prepare('INSERT INTO chat_messages (id, project_id, phase, section, role, content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userMsgId, id, phase, sectionVal, 'user', message);

  if (dryRun) {
    const assistantId = uuid();
    const dryReply = `[Dry-run] 已收到反馈，phase=${phase}${sectionVal ? ', section=' + sectionVal : ''}，消息长度=${message.length}`;
    db.prepare('INSERT INTO chat_messages (id, project_id, phase, section, role, content) VALUES (?, ?, ?, ?, ?, ?)')
      .run(assistantId, id, phase, sectionVal, 'assistant', dryReply);
    return NextResponse.json({ user_message_id: userMsgId, assistant_message_id: assistantId, reply: dryReply, dry_run: true });
  }

  try {
    let llmResult: string;

    if (phase === 'analysis') {
      const summary = db.prepare('SELECT * FROM analysis_summaries WHERE project_id = ?').get(id) as Record<string, string> | undefined;
      const clarifications = db.prepare("SELECT question, status, actual_answer FROM clarification_points WHERE project_id = ?").all(id) as Record<string, string>[];
      const rules = db.prepare("SELECT rule_text FROM business_rules WHERE project_id = ?").all(id) as { rule_text: string }[];

      llmResult = await callLLM([
        { role: 'system', content: ANALYSIS_CHAT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildAnalysisChatUserPrompt(
            message,
            summary?.brd_interpretation || '',
            summary?.process_diagram || '',
            clarifications.map(c => `[${c.status}] ${c.question}${c.actual_answer ? ' → ' + c.actual_answer : ''}`).join('\n'),
            rules.map(r => r.rule_text).join('\n')
          ),
        },
      ], { max_tokens: 8000 }, { projectId: id, phase: 'analysis', action: 'analysis_chat' });

      try {
        const parsed = safeJsonParse<Record<string, string>>(llmResult);
        if (parsed.updated_interpretation) {
          db.prepare("UPDATE analysis_summaries SET brd_interpretation = ?, updated_at = datetime('now') WHERE project_id = ?")
            .run(parsed.updated_interpretation, id);
        }
        if (parsed.updated_diagram) {
          db.prepare("UPDATE analysis_summaries SET process_diagram = ?, updated_at = datetime('now') WHERE project_id = ?")
            .run(parsed.updated_diagram, id);
        }
        llmResult = parsed.message || '已根据你的反馈更新了分析内容。';
      } catch { /* use raw */ }

    } else if (phase === 'hld' && sectionVal && HLD_SECTION_KEYS[sectionVal]) {
      const hld = db.prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id) as Record<string, string> | undefined;
      const secInfo = HLD_SECTION_KEYS[sectionVal];

      llmResult = await callLLM([
        { role: 'system', content: HLD_SECTION_CHAT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildHLDSectionChatUserPrompt(
            message, secInfo.label,
            hld?.[secInfo.content] || '',
            hld?.[secInfo.diagram] || ''
          ),
        },
      ], { max_tokens: 8000 }, { projectId: id, phase: 'hld', action: `hld_chat_${sectionVal}` });

      try {
        const parsed = safeJsonParse<Record<string, string>>(llmResult);
        if (parsed.updated_content) {
          db.prepare(`UPDATE high_level_designs SET ${secInfo.content} = ?, updated_at = datetime('now') WHERE project_id = ?`)
            .run(parsed.updated_content, id);
        }
        if (parsed.updated_diagram) {
          db.prepare(`UPDATE high_level_designs SET ${secInfo.diagram} = ?, updated_at = datetime('now') WHERE project_id = ?`)
            .run(parsed.updated_diagram, id);
        }
        llmResult = parsed.message || '已根据你的反馈更新了方案。';
      } catch { /* use raw */ }

    } else {
      llmResult = '暂不支持该阶段的对话交互。';
    }

    const assistantId = uuid();
    db.prepare('INSERT INTO chat_messages (id, project_id, phase, section, role, content) VALUES (?, ?, ?, ?, ?, ?)')
      .run(assistantId, id, phase, sectionVal, 'assistant', llmResult);

    return NextResponse.json({ user_message_id: userMsgId, assistant_message_id: assistantId, reply: llmResult });

  } catch (err) {
    logError({
      source: 'api/projects/[id]/chat',
      endpoint: `/api/projects/${id}/chat`,
      method: 'POST',
      error: err,
      requestBody: { phase, section: sectionVal, dry_run: dryRun, messageLength: message?.length },
      severity: 'critical',
      context: { projectId: id },
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
