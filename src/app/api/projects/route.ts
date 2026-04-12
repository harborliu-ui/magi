import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export async function GET(request: NextRequest) {
  const systemId = request.nextUrl.searchParams.get('system_id');
  const moduleId = request.nextUrl.searchParams.get('module_id');
  const db = getDb();

  let query = `
    SELECT p.*, s.name as system_name, m.name as module_name
    FROM projects p
    JOIN systems s ON p.system_id = s.id
    LEFT JOIN modules m ON p.module_id = m.id
  `;
  const conditions: string[] = [];
  const params: string[] = [];

  if (systemId) { conditions.push('p.system_id = ?'); params.push(systemId); }
  if (moduleId) { conditions.push('p.module_id = ?'); params.push(moduleId); }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY p.updated_at DESC';

  return NextResponse.json(db.prepare(query).all(...params));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.system_id || !body.name) {
    return NextResponse.json({ error: 'system_id and name required' }, { status: 400 });
  }
  const id = uuid();
  const db = getDb();
  db.prepare(`
    INSERT INTO projects (id, system_id, module_id, name, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, body.system_id, body.module_id || null, body.name, body.description || '');

  const project = db.prepare(`
    SELECT p.*, s.name as system_name, m.name as module_name
    FROM projects p JOIN systems s ON p.system_id = s.id LEFT JOIN modules m ON p.module_id = m.id
    WHERE p.id = ?
  `).get(id);
  return NextResponse.json(project, { status: 201 });
}
