import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { indexConfluenceKb, getKbIndexStatus, parseConfluenceUrl } from '@/lib/confluence';
import { logError } from '@/lib/error-logger';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kb_source_id, system_id } = body;

    if (!kb_source_id || !system_id) {
      return NextResponse.json({ error: '缺少 kb_source_id 或 system_id' }, { status: 400 });
    }

    const db = getDb();
    const kb = db.prepare('SELECT * FROM kb_sources WHERE id = ? AND system_id = ?').get(kb_source_id, system_id) as {
      id: string; type: string; name: string; config: string;
    } | undefined;

    if (!kb) {
      return NextResponse.json({ error: '找不到知识库来源' }, { status: 404 });
    }

    if (kb.type !== 'confluence') {
      return NextResponse.json({ error: '仅支持 Confluence 类型的索引' }, { status: 400 });
    }

    let config: Record<string, string> = {};
    try { config = JSON.parse(kb.config); } catch { config = { value: kb.config }; }
    const rawUrl = config.page_id || config.value || '';

    if (!parseConfluenceUrl(rawUrl)) {
      return NextResponse.json({ error: '无法解析 Confluence URL，仅目录模式支持索引' }, { status: 400 });
    }

    const stats = await indexConfluenceKb(kb.id, system_id, rawUrl);

    return NextResponse.json({
      success: true,
      total: stats.total,
      with_content: stats.withContent,
      status: getKbIndexStatus(kb.id),
    });
  } catch (err) {
    logError({ source: 'kb-index', endpoint: '/api/kb/index', method: 'POST', error: err });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kbSourceId = searchParams.get('kb_source_id');
    const systemId = searchParams.get('system_id');

    if (kbSourceId) {
      return NextResponse.json(getKbIndexStatus(kbSourceId));
    }

    if (systemId) {
      const db = getDb();
      const kbSources = db.prepare("SELECT id FROM kb_sources WHERE system_id = ? AND type = 'confluence'")
        .all(systemId) as { id: string }[];
      const statuses = kbSources.map(kb => getKbIndexStatus(kb.id));
      return NextResponse.json(statuses);
    }

    return NextResponse.json({ error: '需要 kb_source_id 或 system_id 参数' }, { status: 400 });
  } catch (err) {
    logError({ source: 'kb-index', endpoint: '/api/kb/index', method: 'GET', error: err });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kbSourceId = searchParams.get('kb_source_id');
    if (!kbSourceId) {
      return NextResponse.json({ error: '缺少 kb_source_id' }, { status: 400 });
    }
    const db = getDb();
    db.prepare('DELETE FROM kb_page_index WHERE kb_source_id = ?').run(kbSourceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    logError({ source: 'kb-index', endpoint: '/api/kb/index', method: 'DELETE', error: err });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
