import { NextRequest, NextResponse } from 'next/server';
import { logError, sanitizeErrorMessage } from '@/lib/error-logger';
import { getDb } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { HLD_DIAGRAM_REGEN_SYSTEM_PROMPT, buildDiagramRegenPrompt } from '@/lib/prompts';
import { safeJsonParse } from '@/lib/json-repair';

type Ctx = { params: Promise<{ id: string }> };

const SECTION_TO_DIAGRAM: Record<string, string> = {
  information_architecture: 'ia_diagram',
  system_architecture: 'sa_diagram',
  data_architecture: 'da_diagram',
};

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { section_key } = body as { section_key: string };

  const diagramField = SECTION_TO_DIAGRAM[section_key];
  if (!diagramField) {
    return NextResponse.json({ error: '无效的 section_key' }, { status: 400 });
  }

  const db = getDb();
  const hld = db.prepare('SELECT * FROM high_level_designs WHERE project_id = ?').get(id) as Record<string, string> | undefined;
  if (!hld) {
    return NextResponse.json({ error: '高阶方案不存在' }, { status: 404 });
  }

  const textContent = hld[section_key] || '';
  if (!textContent.trim()) {
    return NextResponse.json({ error: '该部分没有文字描述，无法生成图例' }, { status: 400 });
  }

  try {
    const result = await callLLM([
      { role: 'system', content: HLD_DIAGRAM_REGEN_SYSTEM_PROMPT },
      { role: 'user', content: buildDiagramRegenPrompt(section_key, textContent) },
    ], { max_tokens: 4000 }, { projectId: id, phase: 'hld', action: `regenerate_diagram_${section_key}` });

    let diagram = '';
    try {
      const parsed = safeJsonParse<{ diagram?: string }>(result);
      diagram = parsed.diagram || '';
    } catch {
      diagram = result.trim();
    }

    db.prepare(`UPDATE high_level_designs SET ${diagramField} = ?, updated_at = datetime('now') WHERE project_id = ?`)
      .run(diagram, id);

    return NextResponse.json({
      diagram,
      message: diagram ? '图例已重新生成' : '该部分不涉及变更，无图例生成',
    });
  } catch (err) {
    logError({
      source: 'api/projects/[id]/hld/regenerate-diagram',
      endpoint: `/api/projects/${id}/hld/regenerate-diagram`,
      method: 'POST',
      error: err,
      severity: 'error',
      context: { projectId: id, section_key },
    });
    return NextResponse.json({ error: sanitizeErrorMessage(err) }, { status: 500 });
  }
}
