import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const pageId = new URL(req.url).searchParams.get('page_id');
  const spaceKey = new URL(req.url).searchParams.get('space_key');
  const db = getDb();

  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'confluence_%'").all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

  if (!settings.confluence_base_url || !settings.confluence_token) {
    return NextResponse.json({ error: '请先配置 Confluence 连接' }, { status: 400 });
  }

  try {
    let url: string;
    if (pageId) {
      url = `${settings.confluence_base_url}/rest/api/content/${pageId}/child/page?limit=50&expand=version`;
    } else {
      const sk = spaceKey || settings.confluence_space_key;
      if (!sk) return NextResponse.json({ error: '请提供 space_key 或配置默认 Space' }, { status: 400 });
      url = `${settings.confluence_base_url}/rest/api/content?spaceKey=${encodeURIComponent(sk)}&type=page&depth=root&limit=50&expand=version`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${settings.confluence_token}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Confluence API 错误: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (data.results || []).map((r: any) => ({
      id: String(r.id),
      title: String(r.title),
      hasChildren: true,
    }));

    return NextResponse.json(pages);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
