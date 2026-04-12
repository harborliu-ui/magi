import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const annotations = getDb()
    .prepare('SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at ASC')
    .all(id);
  return NextResponse.json(annotations);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const db = getDb();

  const annId = uuid();
  db.prepare(`INSERT INTO annotations (id, project_id, requirement_id, highlighted_text, annotation_text, question, suggested_answer, author, linked_clarification_id, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(annId, id, body.requirement_id, body.highlighted_text, body.annotation_text || '',
      body.question || body.annotation_text || '', body.suggested_answer || '',
      body.author || 'user', body.linked_clarification_id || '', body.severity || 'info', 'open');

  const ann = db.prepare('SELECT * FROM annotations WHERE id = ?').get(annId);
  return NextResponse.json(ann, { status: 201 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const db = getDb();

  if (!body.annotation_id) return NextResponse.json({ error: 'annotation_id required' }, { status: 400 });

  const ann = db.prepare('SELECT * FROM annotations WHERE id = ? AND project_id = ?').get(body.annotation_id, id) as Record<string, string> | undefined;
  if (!ann) return NextResponse.json({ error: '标注不存在' }, { status: 404 });

  if (body.action === 'resolve') {
    db.prepare("UPDATE annotations SET status = 'resolved' WHERE id = ?").run(body.annotation_id);
    return NextResponse.json({ success: true });
  }

  if (body.action === 'reply') {
    db.prepare("UPDATE annotations SET suggested_answer = ?, status = 'resolved' WHERE id = ?")
      .run(body.reply || '', body.annotation_id);
    return NextResponse.json({ success: true });
  }

  if (body.action === 'convert_to_rule') {
    const ruleText = body.rule_text || ann.suggested_answer || ann.question || ann.annotation_text;
    if (!ruleText) return NextResponse.json({ error: '没有可转换为规则的内容' }, { status: 400 });
    db.prepare(`INSERT INTO business_rules (id, project_id, rule_text, source_type, category) VALUES (?, ?, ?, 'clarification', '')`)
      .run(uuid(), id, ruleText);
    db.prepare("UPDATE annotations SET status = 'resolved' WHERE id = ?").run(body.annotation_id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const db = getDb();

  if (body.annotation_id) {
    db.prepare('DELETE FROM annotations WHERE id = ? AND project_id = ?').run(body.annotation_id, id);
  }

  return NextResponse.json({ success: true });
}
