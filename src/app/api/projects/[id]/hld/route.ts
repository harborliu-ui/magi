import { NextRequest, NextResponse } from 'next/server';
import { logError, sanitizeErrorMessage } from '@/lib/error-logger';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { HLD_SYSTEM_PROMPT, buildHLDUserPrompt } from '@/lib/prompts';
import { buildProjectContext } from '@/lib/context-builder';
import { safeJsonParse } from '@/lib/json-repair';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const hld = getDb().prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id);
  return NextResponse.json(hld || null);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const summary = db.prepare('SELECT * FROM analysis_summaries WHERE project_id = ?').get(id) as Record<string, string> | undefined;
  if (!summary) return NextResponse.json({ error: '请先完成业务分析' }, { status: 400 });

  const rules = db.prepare('SELECT rule_text FROM business_rules WHERE project_id = ?').all(id) as { rule_text: string }[];
  const clarifications = db.prepare(
    "SELECT question, actual_answer FROM clarification_points WHERE project_id = ? AND status IN ('answered','converted')"
  ).all(id) as { question: string; actual_answer: string }[];

  const { systemContext, coreContent } = await buildProjectContext(id);

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      interpretation_length: (summary.brd_interpretation || '').length,
      rules_count: rules.length,
      clarifications_count: clarifications.length,
      system_context_length: systemContext.length,
    });
  }

  db.prepare("UPDATE projects SET status = 'hld_draft', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const result = await callLLM([
      { role: 'system', content: HLD_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildHLDUserPrompt(
          project.name, coreContent, summary.brd_interpretation || '',
          rules.map(r => r.rule_text),
          clarifications.map(c => ({ question: c.question, answer: c.actual_answer })),
          systemContext
        ),
      },
    ], { max_tokens: 12000 }, { projectId: id, phase: 'hld', action: 'generate_hld' });

    let parsed: {
      information_architecture?: string; system_architecture?: string; data_architecture?: string;
      ia_diagram?: string; sa_diagram?: string; da_diagram?: string;
      affected_systems?: Array<{ system_name: string; module_name: string; scope_description: string; is_current: boolean }>;
    };
    try {
      parsed = safeJsonParse(result);
    } catch (parseErr) {
      logError({
        source: 'api/projects/[id]/hld',
        endpoint: `/api/projects/${id}/hld`,
        method: 'POST',
        error: parseErr,
        severity: 'critical',
        context: { projectId: id, reason: 'llm_json_parse' },
      });
      db.prepare("UPDATE projects SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?").run(id);
      return NextResponse.json({ error: 'LLM 返回格式异常（已尝试自动修复仍失败）', raw: result }, { status: 500 });
    }

    const affectedJson = JSON.stringify(parsed.affected_systems || []);

    const existing = db.prepare('SELECT id FROM high_level_designs WHERE project_id = ?').get(id);
    if (existing) {
      db.prepare(`UPDATE high_level_designs SET
        information_architecture = ?, system_architecture = ?, data_architecture = ?,
        ia_diagram = ?, sa_diagram = ?, da_diagram = ?,
        affected_systems = ?,
        version = version + 1, status = 'draft', updated_at = datetime('now')
        WHERE project_id = ?`)
        .run(
          parsed.information_architecture || '', parsed.system_architecture || '', parsed.data_architecture || '',
          parsed.ia_diagram || '', parsed.sa_diagram || '', parsed.da_diagram || '',
          affectedJson, id
        );
    } else {
      db.prepare(`INSERT INTO high_level_designs (id, project_id, information_architecture, system_architecture, data_architecture, ia_diagram, sa_diagram, da_diagram, affected_systems) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid(), id,
          parsed.information_architecture || '', parsed.system_architecture || '', parsed.data_architecture || '',
          parsed.ia_diagram || '', parsed.sa_diagram || '', parsed.da_diagram || '',
          affectedJson
        );
    }

    return NextResponse.json(db.prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id));

  } catch (err) {
    logError({
      source: 'api/projects/[id]/hld',
      endpoint: `/api/projects/${id}/hld`,
      method: 'POST',
      error: err,
      severity: 'error',
      context: { projectId: id },
    });
    db.prepare("UPDATE projects SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: sanitizeErrorMessage(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of ['information_architecture', 'system_architecture', 'data_architecture',
    'ia_diagram', 'sa_diagram', 'da_diagram', 'affected_systems', 'status'] as const) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE high_level_designs SET ${fields.join(', ')} WHERE project_id = ?`).run(...values);
  }

  if (body.status === 'confirmed') {
    db.prepare("UPDATE projects SET status = 'hld_confirmed', updated_at = datetime('now') WHERE id = ?").run(id);
  }

  return NextResponse.json(db.prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id));
}
