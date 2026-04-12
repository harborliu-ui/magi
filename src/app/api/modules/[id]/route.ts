import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const mod = getDb().prepare('SELECT * FROM modules WHERE id = ?').get(id);
  if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mod);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ['name', 'description', 'design_principles', 'boundaries']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE modules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  return NextResponse.json(db.prepare('SELECT * FROM modules WHERE id = ?').get(id));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM modules WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
