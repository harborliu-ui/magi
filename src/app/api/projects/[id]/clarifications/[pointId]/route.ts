import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string; pointId: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { pointId } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  if (body.actual_answer !== undefined) {
    const newStatus = body.status || 'answered';
    db.prepare(`
      UPDATE clarification_points 
      SET actual_answer = ?, status = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(body.actual_answer, newStatus, pointId);

    if (newStatus === 'converted' && body.actual_answer) {
      const point = db.prepare('SELECT * FROM clarification_points WHERE id = ?').get(pointId) as Record<string, string>;
      if (point) {
        db.prepare(`
          INSERT INTO business_rules (id, project_id, rule_text, source_type, source_id, category)
          VALUES (?, ?, ?, 'clarification', ?, ?)
        `).run(uuid(), point.project_id, body.actual_answer, pointId, point.category || '');
      }
    }
  }

  return NextResponse.json(db.prepare('SELECT * FROM clarification_points WHERE id = ?').get(pointId));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { pointId } = await ctx.params;
  getDb().prepare('DELETE FROM clarification_points WHERE id = ?').run(pointId);
  return NextResponse.json({ ok: true });
}
