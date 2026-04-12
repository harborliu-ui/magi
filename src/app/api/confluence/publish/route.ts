import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function markdownToConfluenceStorage(md: string): string {
  let html = md;
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    const code = m.replace(/```\w*\n?/g, '').replace(/```/g, '');
    return `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body></ac:structured-macro>`;
  });
  const lines = html.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') ||
      trimmed.startsWith('<blockquote') || trimmed.startsWith('<ac:') || trimmed.startsWith('<li')) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  return result.join('\n');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, parent_page_id, title, space_key } = body as {
    project_id: string; parent_page_id: string; title: string; space_key?: string;
  };

  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'confluence_%'").all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

  if (!settings.confluence_base_url || !settings.confluence_token) {
    return NextResponse.json({ error: '请先配置 Confluence 连接' }, { status: 400 });
  }

  const prd = db.prepare('SELECT * FROM prds WHERE project_id = ?').get(project_id) as { content: string; id: string } | undefined;
  if (!prd) return NextResponse.json({ error: 'PRD 未找到' }, { status: 404 });

  const storageContent = markdownToConfluenceStorage(prd.content);
  const sk = space_key || settings.confluence_space_key;

  const payload: Record<string, unknown> = {
    type: 'page',
    title: title,
    space: { key: sk },
    body: {
      storage: {
        value: storageContent,
        representation: 'storage',
      },
    },
  };

  if (parent_page_id) {
    payload.ancestors = [{ id: parent_page_id }];
  }

  try {
    const res = await fetch(`${settings.confluence_base_url}/rest/api/content`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.confluence_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `Confluence 创建失败: ${res.status} - ${errBody}` }, { status: res.status });
    }

    const data = await res.json();
    const pageId = String(data.id);
    const pageUrl = `${settings.confluence_base_url}${data._links?.webui || `/pages/viewpage.action?pageId=${pageId}`}`;

    db.prepare("UPDATE prds SET confluence_page_id = ?, confluence_url = ?, status = 'published', updated_at = datetime('now') WHERE project_id = ?")
      .run(pageId, pageUrl, project_id);
    db.prepare("UPDATE projects SET status = 'prd_final', updated_at = datetime('now') WHERE id = ?")
      .run(project_id);

    return NextResponse.json({ page_id: pageId, page_url: pageUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
