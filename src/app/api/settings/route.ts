import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return NextResponse.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getDb();
  const upsert = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const [key, value] of Object.entries(body)) {
    upsert.run(key, String(value));
  }
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return NextResponse.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
}
