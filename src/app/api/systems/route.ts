import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export async function GET() {
  const db = getDb();
  const systems = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM projects p WHERE p.system_id = s.id) as project_count
    FROM systems s ORDER BY s.updated_at DESC
  `).all();

  for (const sys of systems as Record<string, unknown>[]) {
    (sys as Record<string, unknown>).modules = db.prepare(
      'SELECT * FROM modules WHERE system_id = ? ORDER BY name'
    ).all(sys.id as string);
    (sys as Record<string, unknown>).kb_sources = db.prepare(
      'SELECT * FROM kb_sources WHERE system_id = ? ORDER BY created_at'
    ).all(sys.id as string);
  }

  return NextResponse.json(systems);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = uuid();
  const db = getDb();

  db.prepare(`
    INSERT INTO systems (id, name, description, design_principles, boundaries)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, body.name, body.description || '', body.design_principles || '', body.boundaries || '');

  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
  return NextResponse.json(system, { status: 201 });
}
