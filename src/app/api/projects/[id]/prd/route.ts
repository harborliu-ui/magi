import { NextRequest, NextResponse } from 'next/server';
import { logError, sanitizeErrorMessage } from '@/lib/error-logger';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { PRD_SYSTEM_PROMPT, buildPRDUserPrompt } from '@/lib/prompts';
import { buildProjectContext } from '@/lib/context-builder';
import { getConfluencePageContent } from '@/lib/confluence';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const prd = getDb().prepare('SELECT * FROM prds WHERE project_id = ?').get(id);
  return NextResponse.json(prd || null);
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, string>;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { systemContext, coreContent } = await buildProjectContext(id);

  const rules = db.prepare('SELECT rule_text FROM business_rules WHERE project_id = ?').all(id) as { rule_text: string }[];
  const clarifications = db.prepare(
    "SELECT question, actual_answer FROM clarification_points WHERE project_id = ? AND status IN ('answered','converted')"
  ).all(id) as { question: string; actual_answer: string }[];

  const hld = db.prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id) as Record<string, string> | undefined;

  // Resolve PRD template — prefer Confluence template if configured
  let templateContent = '';
  const confTemplateId = (db.prepare("SELECT value FROM settings WHERE key = 'prd_template_confluence_id'").get() as { value: string } | undefined)?.value;
  if (confTemplateId) {
    templateContent = await getConfluencePageContent(confTemplateId);
  }
  if (!templateContent) {
    const tmpl = db.prepare('SELECT content FROM prd_templates WHERE is_default = 1').get() as { content: string } | undefined;
    templateContent = tmpl?.content || '';
  }

  const scopeMode = project.scope_mode || 'current_system';

  // If scope_mode is current_system and HLD has affected_systems, filter HLD content
  let hldContent: { ia: string; sa: string; da: string } | undefined;
  if (hld) {
    hldContent = {
      ia: hld.information_architecture || '',
      sa: hld.system_architecture || '',
      da: hld.data_architecture || '',
    };
  }

  db.prepare("UPDATE projects SET status = 'prd_draft', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const content = await callLLM([
      { role: 'system', content: PRD_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildPRDUserPrompt(
          project.name, coreContent,
          rules.map(r => r.rule_text),
          clarifications.map(c => ({ question: c.question, answer: c.actual_answer })),
          systemContext, templateContent, hldContent, scopeMode
        ),
      },
    ], { max_tokens: 16000 }, { projectId: id, phase: 'prd', action: 'generate_prd' });

    const existing = db.prepare('SELECT * FROM prds WHERE project_id = ?').get(id);
    if (existing) {
      db.prepare(`UPDATE prds SET content = ?, version = version + 1, updated_at = datetime('now') WHERE project_id = ?`).run(content, id);
    } else {
      db.prepare(`INSERT INTO prds (id, project_id, content) VALUES (?, ?, ?)`).run(uuid(), id, content);
    }

    return NextResponse.json(db.prepare('SELECT * FROM prds WHERE project_id = ?').get(id));
  } catch (err) {
    logError({
      source: 'api/projects/[id]/prd',
      endpoint: `/api/projects/${id}/prd`,
      method: 'POST',
      error: err,
      severity: 'critical',
      context: { projectId: id },
    });
    return NextResponse.json({ error: sanitizeErrorMessage(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  if (body.content !== undefined) {
    db.prepare("UPDATE prds SET content = ?, updated_at = datetime('now') WHERE project_id = ?").run(body.content, id);
  }
  if (body.status !== undefined) {
    db.prepare("UPDATE prds SET status = ?, updated_at = datetime('now') WHERE project_id = ?").run(body.status, id);
    if (body.status === 'published') {
      db.prepare("UPDATE projects SET status = 'prd_final', updated_at = datetime('now') WHERE id = ?").run(id);
    }
  }

  return NextResponse.json(db.prepare('SELECT * FROM prds WHERE project_id = ?').get(id));
}
