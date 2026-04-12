import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const summary = getDb().prepare('SELECT * FROM analysis_summaries WHERE project_id = ?').get(id);
  return NextResponse.json(summary || null);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM analysis_summaries WHERE project_id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  if (body.brd_interpretation !== undefined) {
    db.prepare("UPDATE analysis_summaries SET brd_interpretation = ?, updated_at = datetime('now') WHERE project_id = ?")
      .run(body.brd_interpretation, id);
  }
  if (body.process_diagram !== undefined) {
    db.prepare("UPDATE analysis_summaries SET process_diagram = ?, updated_at = datetime('now') WHERE project_id = ?")
      .run(body.process_diagram, id);
  }

  return NextResponse.json(db.prepare('SELECT * FROM analysis_summaries WHERE project_id = ?').get(id));
}
