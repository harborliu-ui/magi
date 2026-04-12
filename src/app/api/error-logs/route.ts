import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = getDb();
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100');
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');
  const severity = req.nextUrl.searchParams.get('severity');

  let sql = 'SELECT * FROM error_logs';
  const params: unknown[] = [];

  if (severity) {
    sql += ' WHERE severity = ?';
    params.push(severity);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = db.prepare(sql).all(...params);
  const total = db.prepare(
    severity ? 'SELECT COUNT(*) as count FROM error_logs WHERE severity = ?' : 'SELECT COUNT(*) as count FROM error_logs'
  ).get(...(severity ? [severity] : [])) as { count: number };

  return NextResponse.json({ logs, total: total.count });
}

export async function DELETE(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));

  if (body.id) {
    db.prepare('DELETE FROM error_logs WHERE id = ?').run(body.id);
  } else if (body.clear_all) {
    db.prepare('DELETE FROM error_logs').run();
  }

  return NextResponse.json({ success: true });
}
