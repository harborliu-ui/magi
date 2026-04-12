import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ['name', 'description', 'trigger_description', 'system_prompt', 'output_format', 'example']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  return NextResponse.json(db.prepare('SELECT * FROM skills WHERE id = ?').get(id));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM skills WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
