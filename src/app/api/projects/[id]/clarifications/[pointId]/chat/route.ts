import { NextRequest, NextResponse } from 'next/server';
import { logError, sanitizeErrorMessage } from '@/lib/error-logger';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { safeJsonParse } from '@/lib/json-repair';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string; pointId: string }> };

const CP_CHAT_SYSTEM_PROMPT = `你是一位资深供应链技术 PM 搭档。你正在和 FPM 讨论一个业务待确认点。

## 你的角色
- 认真评估用户对待确认点的回答
- 如果回答清晰且完整，确认其合理性并总结为可执行的业务规则
- 如果回答模糊、存在遗漏或逻辑问题，礼貌地追问具体细节
- 如果回答与系统设计原则冲突，指出冲突并建议调整

## 输出格式
严格输出 JSON：
{
  "message": "你的回复内容（Markdown 格式，可以包含追问、确认、分析等）",
  "is_conclusive": false,
  "suggested_rule": null
}

字段说明：
- message: 你的回复。如果需要追问，在回复中提出具体问题。如果用户的回答已经足够清晰，给出确认。
- is_conclusive: 当你认为这个待确认点已经可以形成明确的业务规则时，设为 true。不要过早设为 true，除非用户给出了足够具体的回答。
- suggested_rule: 当 is_conclusive 为 true 时，将对话结论总结为一条简洁的业务规则文本。否则设为 null。`;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, pointId } = await ctx.params;
  const messages = getDb().prepare(
    "SELECT * FROM chat_messages WHERE project_id = ? AND phase = 'clarification' AND section = ? ORDER BY created_at"
  ).all(id, pointId);
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id, pointId } = await ctx.params;
  const body = await request.json();
  const userMessage = body.message?.trim();
  if (!userMessage) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });

  const db = getDb();
  const dryRun = body.dry_run === true;

  const point = db.prepare('SELECT * FROM clarification_points WHERE id = ? AND project_id = ?')
    .get(pointId, id) as Record<string, string> | undefined;
  if (!point) return NextResponse.json({ error: '待确认点不存在' }, { status: 404 });

  // Save user message
  const userMsgId = uuid();
  try {
    db.prepare(`INSERT INTO chat_messages (id, project_id, phase, section, role, content) VALUES (?, ?, 'clarification', ?, 'user', ?)`)
      .run(userMsgId, id, pointId, userMessage);
  } catch (insertErr) {
    logError({ source: 'cp-chat', endpoint: `/api/projects/${id}/clarifications/${pointId}/chat`, method: 'POST', error: insertErr, severity: 'error', context: { projectId: id, pointId, hint: 'chat_messages INSERT failed — possible CHECK constraint issue' } });
    return NextResponse.json({ error: '保存消息失败，请重启服务后重试' }, { status: 500 });
  }

  // Update CP status to answered if still pending
  if (point.status === 'pending') {
    db.prepare("UPDATE clarification_points SET actual_answer = ?, status = 'answered', updated_at = datetime('now') WHERE id = ?")
      .run(userMessage, pointId);
  }

  if (dryRun) {
    const assistantMsg = '（dry-run 模式：跳过 LLM 调用）';
    const assistantId = uuid();
    db.prepare(`INSERT INTO chat_messages (id, project_id, phase, section, role, content, metadata) VALUES (?, ?, 'clarification', ?, 'assistant', ?, ?)`)
      .run(assistantId, id, pointId, assistantMsg, JSON.stringify({ is_conclusive: false, suggested_rule: null }));
    return NextResponse.json({ user_message_id: userMsgId, assistant_message_id: assistantId, message: assistantMsg });
  }

  // Build conversation context
  const history = db.prepare(
    "SELECT role, content FROM chat_messages WHERE project_id = ? AND phase = 'clarification' AND section = ? ORDER BY created_at"
  ).all(id, pointId) as { role: string; content: string }[];

  // Load system context for the project
  const project = db.prepare('SELECT system_id FROM projects WHERE id = ?').get(id) as { system_id: string } | undefined;
  let systemContextSnippet = '';
  if (project?.system_id) {
    const sys = db.prepare('SELECT name, design_principles, boundaries FROM systems WHERE id = ?')
      .get(project.system_id) as { name: string; design_principles: string; boundaries: string } | undefined;
    if (sys) {
      systemContextSnippet = `\n## 系统上下文\n系统: ${sys.name}\n设计原则: ${(sys.design_principles || '').slice(0, 1000)}\n系统边界: ${(sys.boundaries || '').slice(0, 1000)}`;
    }
  }

  // Limit conversation history to last 20 messages to prevent unbounded growth
  const recentHistory = history.slice(-20);

  const userPrompt = `<clarification_point>
**问题**: ${point.question}
**原因**: ${point.reason || '无'}
**建议答案**: ${point.suggested_answer || '无'}
**严重度**: ${point.severity || 'info'}
</clarification_point>
${systemContextSnippet ? `\n<system_context>${systemContextSnippet}\n</system_context>` : ''}

<conversation_history>
${recentHistory.map(m => `**${m.role === 'user' ? '用户' : 'AI'}**: ${m.content}`).join('\n\n')}
</conversation_history>`;

  try {
    const result = await callLLM([
      { role: 'system', content: CP_CHAT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { max_tokens: 2000, temperature: 0.4 }, { projectId: id, phase: 'clarification', action: 'cp_chat' });

    let parsed: { message: string; is_conclusive?: boolean; suggested_rule?: string | null };
    try {
      parsed = safeJsonParse(result);
    } catch {
      parsed = { message: result, is_conclusive: false, suggested_rule: null };
    }

    const assistantId = uuid();
    db.prepare(`INSERT INTO chat_messages (id, project_id, phase, section, role, content, metadata) VALUES (?, ?, 'clarification', ?, 'assistant', ?, ?)`)
      .run(assistantId, id, pointId, parsed.message, JSON.stringify({
        is_conclusive: parsed.is_conclusive || false,
        suggested_rule: parsed.suggested_rule || null,
      }));

    return NextResponse.json({
      user_message_id: userMsgId,
      assistant_message_id: assistantId,
      message: parsed.message,
      is_conclusive: parsed.is_conclusive || false,
      suggested_rule: parsed.suggested_rule || null,
    });
  } catch (err) {
    logError({ source: 'cp-chat', endpoint: `/api/projects/${id}/clarifications/${pointId}/chat`, method: 'POST', error: err, severity: 'error', context: { projectId: id, pointId } });
    return NextResponse.json({ error: sanitizeErrorMessage(err) }, { status: 500 });
  }
}
