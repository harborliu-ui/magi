import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  let body: Record<string, string> = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const saved = Object.fromEntries(rows.map(r => [r.key, r.value]));

  const baseUrl = body.confluence_base_url ?? saved.confluence_base_url;
  const token = body.confluence_token ?? saved.confluence_token;

  if (!baseUrl || !token) {
    return NextResponse.json({ success: false, error: '请先填写 Confluence 地址和 Token' });
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/rest/api/content/search?cql=${encodeURIComponent('type=page')}&limit=1`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const status = res.status;
      let hint = `HTTP ${status}`;
      if (status === 401 || status === 403) hint = 'Token 无效或权限不足';
      else if (status === 404) hint = 'Confluence 地址错误，无法找到 API 端点';
      return NextResponse.json({ success: false, error: hint });
    }

    const data = await res.json();
    const total = data.totalSize || data.size || 0;
    return NextResponse.json({ success: true, message: `连接成功，找到 ${total} 个页面` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let hint = '';
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) hint = 'Confluence 地址无法访问';
    else if (msg.includes('timeout') || msg.includes('TimeoutError')) hint = '连接超时';
    return NextResponse.json({ success: false, error: hint || msg });
  }
}
