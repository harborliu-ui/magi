import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
  if (!system) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const s = system as Record<string, unknown>;
  s.modules = db.prepare('SELECT * FROM modules WHERE system_id = ? ORDER BY name').all(id);
  s.kb_sources = db.prepare('SELECT * FROM kb_sources WHERE system_id = ? ORDER BY created_at').all(id);
  s.projects = db.prepare(`
    SELECT p.*, m.name as module_name 
    FROM projects p LEFT JOIN modules m ON p.module_id = m.id 
    WHERE p.system_id = ? ORDER BY p.updated_at DESC
  `).all(id);
  return NextResponse.json(s);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  if (body.kb_sources) {
    db.prepare('DELETE FROM kb_sources WHERE system_id = ?').run(id);
    const insert = db.prepare('INSERT INTO kb_sources (id, system_id, type, name, config) VALUES (?, ?, ?, ?, ?)');
    for (const kb of body.kb_sources) {
      insert.run(kb.id || uuid(), id, kb.type, kb.name, JSON.stringify(kb.config || {}));
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ['name', 'description', 'design_principles', 'boundaries']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE systems SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT * FROM systems WHERE id = ?').get(id) as Record<string, unknown>;
  updated.kb_sources = db.prepare('SELECT * FROM kb_sources WHERE system_id = ? ORDER BY created_at').all(id);
  updated.modules = db.prepare('SELECT * FROM modules WHERE system_id = ? ORDER BY name').all(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM systems WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
