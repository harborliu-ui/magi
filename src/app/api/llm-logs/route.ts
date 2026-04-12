import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get('limit') || '50'), 200);
  const offset = Number(params.get('offset') || '0');
  const phase = params.get('phase') || '';
  const projectId = params.get('project_id') || '';

  let where = '1=1';
  const args: (string | number)[] = [];

  if (phase) { where += ' AND phase = ?'; args.push(phase); }
  if (projectId) { where += ' AND project_id = ?'; args.push(projectId); }

  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM llm_logs WHERE ${where}`).get(...args) as { cnt: number }).cnt;
  args.push(limit, offset);
  const logs = db.prepare(`SELECT id, project_id, phase, action, model, tokens_in, tokens_out, duration_ms, status, error_message, created_at,
    length(system_prompt) as sys_len, length(user_prompt) as user_len, length(response) as resp_len
    FROM llm_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args);

  return NextResponse.json({ total, logs });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  if (body.id) {
    db.prepare('DELETE FROM llm_logs WHERE id = ?').run(body.id);
  } else {
    db.prepare('DELETE FROM llm_logs').run();
  }
  return NextResponse.json({ success: true });
}
