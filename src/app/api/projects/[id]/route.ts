import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, s.name as system_name, m.name as module_name
    FROM projects p
    JOIN systems s ON p.system_id = s.id
    LEFT JOIN modules m ON p.module_id = m.id
    WHERE p.id = ?
  `).get(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ['name', 'description', 'status', 'module_id', 'scope_mode']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const project = db.prepare(`
    SELECT p.*, s.name as system_name, m.name as module_name
    FROM projects p JOIN systems s ON p.system_id = s.id LEFT JOIN modules m ON p.module_id = m.id
    WHERE p.id = ?
  `).get(id);
  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
