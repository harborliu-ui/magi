import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

type Ctx = { params: Promise<{ id: string; pointId: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id, pointId } = await ctx.params;
  const body = await request.json();
  const db = getDb();

  if (body.actual_answer !== undefined) {
    const newStatus = body.status || 'answered';
    db.prepare(`
      UPDATE clarification_points 
      SET actual_answer = ?, status = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(body.actual_answer, newStatus, pointId);

    if (newStatus === 'converted') {
      const point = db.prepare('SELECT * FROM clarification_points WHERE id = ?').get(pointId) as Record<string, string>;
      if (point) {
        // Build rule text from conversation if available, otherwise use actual_answer
        let ruleText = body.actual_answer || '';
        if (body.use_conversation) {
          const msgs = db.prepare(
            "SELECT role, content FROM chat_messages WHERE project_id = ? AND phase = 'clarification' AND section = ? ORDER BY created_at"
          ).all(id, pointId) as { role: string; content: string }[];
          if (msgs.length > 0) {
            const conversationSummary = msgs.map(m =>
              `${m.role === 'user' ? '【FPM】' : '【AI】'}: ${m.content}`
            ).join('\n\n');
            ruleText = body.rule_text || `对话结论：\n${conversationSummary}`;
          }
        }
        if (body.rule_text) ruleText = body.rule_text;

        if (ruleText) {
          db.prepare(`
            INSERT INTO business_rules (id, project_id, rule_text, source_type, source_id, category)
            VALUES (?, ?, ?, 'clarification', ?, ?)
          `).run(uuid(), point.project_id, ruleText, pointId, point.category || '');
        }
      }
    }
  }

  return NextResponse.json(db.prepare('SELECT * FROM clarification_points WHERE id = ?').get(pointId));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { pointId } = await ctx.params;
  getDb().prepare('DELETE FROM clarification_points WHERE id = ?').run(pointId);
  return NextResponse.json({ ok: true });
}
