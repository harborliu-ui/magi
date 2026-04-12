import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export async function GET() {
  return NextResponse.json(getDb().prepare('SELECT * FROM skills ORDER BY created_at DESC').all());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = uuid();
  getDb().prepare(`
    INSERT INTO skills (id, name, description, trigger_description, system_prompt, output_format, example)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, body.name, body.description || '', body.trigger_description || '', body.system_prompt || '', body.output_format || '', body.example || '');

  return NextResponse.json(getDb().prepare('SELECT * FROM skills WHERE id = ?').get(id), { status: 201 });
}
