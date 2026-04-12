import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, config } = body as { type: string; config: string };

  if (type === 'confluence') {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'confluence_%'").all() as { key: string; value: string }[];
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

    if (!settings.confluence_base_url || !settings.confluence_token) {
      return NextResponse.json({ success: false, error: '请先在设置页面配置 Confluence 连接' });
    }

    let configObj: Record<string, string> = {};
    try { configObj = JSON.parse(config); } catch { configObj = { value: config }; }
    const value = configObj.page_id || configObj.value || config;

    if (/^\d+$/.test(value)) {
      try {
        const url = `${settings.confluence_base_url}/rest/api/content/${value}?expand=title`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${settings.confluence_token}`, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: `页面 ${value} 不存在或无权访问 (HTTP ${res.status})` });
        }
        const data = await res.json();
        return NextResponse.json({ success: true, message: `找到页面：${data.title}` });
      } catch (err) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      try {
        const cql = encodeURIComponent(`text ~ "${value}" ORDER BY lastModified DESC`);
        const url = `${settings.confluence_base_url}/rest/api/content/search?cql=${cql}&limit=3`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${settings.confluence_token}`, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: `搜索失败 (HTTP ${res.status})` });
        }
        const data = await res.json();
        const count = data.results?.length || 0;
        if (count === 0) {
          return NextResponse.json({ success: false, error: `关键词"${value}"未搜到任何页面` });
        }
        const titles = data.results.slice(0, 3).map((r: Record<string, string>) => r.title).join('、');
        return NextResponse.json({ success: true, message: `搜到 ${count} 个页面：${titles}` });
      } catch (err) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (type === 'markdown') {
    const content = config || '';
    if (content.length < 10) {
      return NextResponse.json({ success: false, error: '内容过短（少于 10 字符）' });
    }
    return NextResponse.json({ success: true, message: `Markdown 内容有效（${content.length} 字符）` });
  }

  if (type === 'code_repo') {
    return NextResponse.json({ success: true, message: '代码仓库路径已记录（将在分析时读取）' });
  }

  return NextResponse.json({ success: false, error: '未知的 KB 类型' });
}
