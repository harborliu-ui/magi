import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export async function GET(request: NextRequest) {
  const systemId = request.nextUrl.searchParams.get('system_id');
  const db = getDb();
  const query = systemId
    ? db.prepare('SELECT * FROM modules WHERE system_id = ? ORDER BY name')
    : db.prepare('SELECT * FROM modules ORDER BY name');
  return NextResponse.json(systemId ? query.all(systemId) : query.all());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.system_id || !body.name) {
    return NextResponse.json({ error: 'system_id and name required' }, { status: 400 });
  }
  const id = uuid();
  const db = getDb();
  db.prepare(`
    INSERT INTO modules (id, system_id, name, description, design_principles, boundaries)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, body.system_id, body.name, body.description || '', body.design_principles || '', body.boundaries || '');

  return NextResponse.json(db.prepare('SELECT * FROM modules WHERE id = ?').get(id), { status: 201 });
}
