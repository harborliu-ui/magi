import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json(
    getDb().prepare('SELECT * FROM business_rules WHERE project_id = ? ORDER BY created_at').all(id)
  );
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const ruleId = uuid();
  getDb().prepare(`
    INSERT INTO business_rules (id, project_id, rule_text, source_type, category)
    VALUES (?, ?, ?, 'manual', ?)
  `).run(ruleId, id, body.rule_text, body.category || '');

  return NextResponse.json(getDb().prepare('SELECT * FROM business_rules WHERE id = ?').get(ruleId), { status: 201 });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  await ctx.params;
  const body = await request.json();
  if (!body.rule_id) return NextResponse.json({ error: 'rule_id required' }, { status: 400 });
  getDb().prepare('DELETE FROM business_rules WHERE id = ?').run(body.rule_id);
  return NextResponse.json({ ok: true });
}
