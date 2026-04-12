import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/prompts';
import { buildProjectContext } from '@/lib/context-builder';
import { logError, sanitizeErrorMessage } from '@/lib/error-logger';
import { safeJsonParse } from '@/lib/json-repair';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const mode = url.searchParams.get('mode') || 'full'; // 'full' | 'refresh'
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const requirements = db.prepare('SELECT * FROM requirements WHERE project_id = ?').all(id) as Record<string, string>[];
  const coreTypes = new Set(['brd', 'frf', 'google_doc']);
  const hasCore = requirements.some(r => coreTypes.has(r.type));
  if (!hasCore) {
    return NextResponse.json({ error: '请先添加 BRD 或 FRF 文档' }, { status: 400 });
  }

  const { systemContext, coreContent, referenceContent, analysisCustomRules, contextLog } = await buildProjectContext(id);

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      context_log: contextLog,
      system_context_length: systemContext.length,
      brd_content_length: coreContent.length,
      reference_content_length: referenceContent.length,
      system_context_full: systemContext,
      system_context_preview: systemContext.slice(0, 1000),
    });
  }

  // In refresh mode, collect confirmed CPs and rules to feed back to LLM
  let confirmedContext = '';
  if (mode === 'refresh') {
    const answeredCPs = db.prepare(
      "SELECT question, actual_answer, status FROM clarification_points WHERE project_id = ? AND status IN ('answered','converted')"
    ).all(id) as { question: string; actual_answer: string; status: string }[];
    const existingRules = db.prepare(
      "SELECT rule_text FROM business_rules WHERE project_id = ?"
    ).all(id) as { rule_text: string }[];

    if (answeredCPs.length > 0 || existingRules.length > 0) {
      confirmedContext = '\n\n## 已确认的信息（请在更新解读时纳入这些已确认的事实）\n';
      if (answeredCPs.length > 0) {
        confirmedContext += '### 已确认的待确认点\n' + answeredCPs.map((cp, i) =>
          `${i + 1}. Q: ${cp.question}\n   A: ${cp.actual_answer} [${cp.status}]`
        ).join('\n') + '\n';
      }
      if (existingRules.length > 0) {
        confirmedContext += '### 已确认的业务规则\n' + existingRules.map((r, i) =>
          `${i + 1}. ${r.rule_text}`
        ).join('\n') + '\n';
      }
    }
  }

  db.prepare("UPDATE projects SET status = 'analyzing', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const userContent = buildAnalysisUserPrompt(coreContent, referenceContent, systemContext + confirmedContext, analysisCustomRules);

    const result = await callLLM([
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { max_tokens: 12000 }, { projectId: id, phase: 'analysis', action: mode === 'refresh' ? 'refresh_analysis' : 'analyze_brd' });

    type AnalysisResult = {
      brd_interpretation?: string;
      process_diagram?: string;
      annotations?: Array<{ highlighted_text: string; annotation_text: string; severity?: string; linked_clarification_index?: number }>;
      clarification_points?: Array<Record<string, string>>;
      business_rules?: Array<Record<string, string>>;
    };

    let parsed: AnalysisResult;
    try {
      parsed = safeJsonParse<AnalysisResult>(result);
    } catch (parseErr) {
      try {
        const retryResult = await callLLM([
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
          { role: 'assistant', content: result },
          { role: 'user', content: '你上次的输出存在 JSON 格式错误（字符串中的双引号未转义）。请重新输出完整的 JSON，确保所有字符串内部的双引号使用 \\" 转义。只输出 JSON，不要任何其他文字。' },
        ], { max_tokens: 12000 }, { projectId: id, phase: 'analysis', action: 'analyze_brd_retry' });
        parsed = safeJsonParse<AnalysisResult>(retryResult);
      } catch (retryErr) {
        db.prepare("UPDATE projects SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(id);
        logError({ source: 'analyze/parse', endpoint: `/api/projects/${id}/analyze`, method: 'POST', error: parseErr, severity: 'critical', context: { project_id: id, raw_preview: result.slice(0, 500), retry_error: String(retryErr) } });
        return NextResponse.json({ error: 'LLM 返回格式异常（已重试仍失败）', raw: result, context_log: contextLog }, { status: 500 });
      }
    }

    const transaction = db.transaction(() => {
      // Always update analysis summary
      const existing = db.prepare('SELECT id FROM analysis_summaries WHERE project_id = ?').get(id);
      if (existing) {
        db.prepare(`UPDATE analysis_summaries SET brd_interpretation = ?, process_diagram = ?, version = version + 1, updated_at = datetime('now') WHERE project_id = ?`)
          .run(parsed.brd_interpretation || '', parsed.process_diagram || '', id);
      } else {
        db.prepare(`INSERT INTO analysis_summaries (id, project_id, brd_interpretation, process_diagram) VALUES (?, ?, ?, ?)`)
          .run(uuid(), id, parsed.brd_interpretation || '', parsed.process_diagram || '');
      }

      if (mode === 'refresh') {
        // Refresh mode: keep answered/converted CPs, only replace pending ones and add new ones
        db.prepare("DELETE FROM clarification_points WHERE project_id = ? AND status = 'pending'").run(id);
      } else {
        // Full mode: replace all CPs
        db.prepare('DELETE FROM clarification_points WHERE project_id = ?').run(id);
      }

      const cpIds: string[] = [];
      const existingQuestions = mode === 'refresh'
        ? new Set((db.prepare("SELECT question FROM clarification_points WHERE project_id = ?").all(id) as { question: string }[]).map(r => r.question))
        : new Set<string>();

      const insertCP = db.prepare(`
        INSERT INTO clarification_points (id, project_id, category, question, reason, suggested_answer, severity, source, confluence_refs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cp of parsed.clarification_points || []) {
        if (mode === 'refresh' && existingQuestions.has(cp.question)) {
          cpIds.push('');
          continue;
        }
        const cpId = uuid();
        cpIds.push(cpId);
        const confRefs = JSON.stringify(cp.confluence_refs || []);
        insertCP.run(cpId, id, cp.category || 'general', cp.question, cp.reason || '', cp.suggested_answer || '', cp.severity || 'info', cp.source || '', confRefs);
      }

      // Always replace AI annotations
      db.prepare("DELETE FROM annotations WHERE project_id = ? AND author = 'ai'").run(id);
      const coreReqs = requirements.filter(r => coreTypes.has(r.type));
      const insertAnn = db.prepare(`INSERT INTO annotations (id, project_id, requirement_id, highlighted_text, annotation_text, question, suggested_answer, author, linked_clarification_id, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`);

      for (const ann of parsed.annotations || []) {
        const matchReq = coreReqs.find(r => r.content && r.content.includes(ann.highlighted_text));
        if (matchReq) {
          const linkedCpId = (ann.linked_clarification_index != null && ann.linked_clarification_index >= 0 && ann.linked_clarification_index < cpIds.length)
            ? cpIds[ann.linked_clarification_index] : '';
          const linkedCp = linkedCpId ? (parsed.clarification_points || [])[ann.linked_clarification_index!] : null;
          insertAnn.run(uuid(), id, matchReq.id, ann.highlighted_text, ann.annotation_text || '',
            linkedCp?.question || ann.annotation_text || '', linkedCp?.suggested_answer || '', linkedCpId, ann.severity || 'info');
        }
      }

      if (mode !== 'refresh') {
        // Full mode: replace requirement-sourced rules
        db.prepare("DELETE FROM business_rules WHERE project_id = ? AND source_type = 'requirement'").run(id);
        const insertBR = db.prepare(`INSERT INTO business_rules (id, project_id, rule_text, source_type, category) VALUES (?, ?, ?, 'requirement', ?)`);
        for (const br of parsed.business_rules || []) {
          insertBR.run(uuid(), id, br.rule_text, br.category || '');
        }
      }

      db.prepare("UPDATE projects SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?").run(id);
    });
    transaction();

    return NextResponse.json({
      mode,
      brd_interpretation: (parsed.brd_interpretation || '').length,
      process_diagram: (parsed.process_diagram || '').length,
      annotations: parsed.annotations?.length || 0,
      clarification_points: parsed.clarification_points?.length || 0,
      business_rules: parsed.business_rules?.length || 0,
      context_log: contextLog,
    });
  } catch (err) {
    db.prepare("UPDATE projects SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(id);
    logError({ source: 'analyze/llm', endpoint: `/api/projects/${id}/analyze`, method: 'POST', error: err, severity: 'critical', context: { project_id: id } });
    return NextResponse.json({ error: sanitizeErrorMessage(err), context_log: contextLog }, { status: 500 });
  }
}
