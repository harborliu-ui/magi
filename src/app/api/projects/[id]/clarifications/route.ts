import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json(
    getDb().prepare('SELECT * FROM clarification_points WHERE project_id = ? ORDER BY created_at').all(id)
  );
}
