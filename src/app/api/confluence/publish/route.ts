import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { resolveConfluencePageId } from '@/lib/confluence';

function escapeXhtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  const tokens: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^(.*?)`(.+?)`([\s\S]*)$/);
    if (codeMatch) {
      if (codeMatch[1]) tokens.push(formatPlain(codeMatch[1]));
      tokens.push(`<code>${escapeXhtml(codeMatch[2])}</code>`);
      remaining = codeMatch[3];
      continue;
    }
    tokens.push(formatPlain(remaining));
    break;
  }
  return tokens.join('');
}

function formatPlain(text: string): string {
  let s = escapeXhtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function parseTableRow(line: string, tag: 'th' | 'td'): string {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return '<tr>' + cells.map(c => `<${tag}>${inlineFormat(c.trim())}</${tag}>`).join('') + '</tr>';
}

function markdownToConfluenceStorage(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inTable = false;

  const closeList = () => {
    if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null; }
  };
  const closeTable = () => {
    if (inTable) { result.push('</tbody></table>'); inTable = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      closeList(); closeTable();
      if (!inCodeBlock) { inCodeBlock = true; codeBuffer = []; }
      else {
        inCodeBlock = false;
        result.push(`<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${codeBuffer.join('\n')}]]></ac:plain-text-body></ac:structured-macro>`);
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList();
      const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() : '';
      if (!inTable && isTableSeparator(nextLine)) {
        // Header row — start table
        inTable = true;
        result.push('<table><thead>' + parseTableRow(trimmed, 'th') + '</thead><tbody>');
        i++; // skip separator row
        continue;
      }
      if (inTable) {
        if (isTableSeparator(trimmed)) continue; // skip stray separators
        result.push(parseTableRow(trimmed, 'td'));
        continue;
      }
      // Standalone pipe-line without header context — treat as paragraph
    }

    if (inTable && !(trimmed.startsWith('|') && trimmed.endsWith('|'))) {
      closeTable();
    }

    if (!trimmed) { closeList(); continue; }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (ulMatch) {
      closeTable();
      if (inList === 'ol') { result.push('</ol>'); inList = null; }
      if (!inList) { result.push('<ul>'); inList = 'ul'; }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }
    if (olMatch) {
      closeTable();
      if (inList === 'ul') { result.push('</ul>'); inList = null; }
      if (!inList) { result.push('<ol>'); inList = 'ol'; }
      result.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    closeList(); closeTable();

    if (trimmed.startsWith('### '))      { result.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`); }
    else if (trimmed.startsWith('## '))   { result.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`); }
    else if (trimmed.startsWith('# '))    { result.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`); }
    else if (trimmed.startsWith('> '))    { result.push(`<blockquote><p>${inlineFormat(trimmed.slice(2))}</p></blockquote>`); }
    else if (trimmed.startsWith('---'))   { result.push('<hr/>'); }
    else                                  { result.push(`<p>${inlineFormat(trimmed)}</p>`); }
  }

  closeList(); closeTable();
  return result.join('\n');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, parent_page_url, title, space_key } = body as {
    project_id: string; parent_page_url?: string; title: string; space_key?: string;
    parent_page_id?: string; // legacy compat
  };

  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'confluence_%'").all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

  if (!settings.confluence_base_url || !settings.confluence_token) {
    return NextResponse.json({ error: '请先配置 Confluence 连接' }, { status: 400 });
  }

  const prd = db.prepare('SELECT * FROM prds WHERE project_id = ?').get(project_id) as { content: string; id: string } | undefined;
  if (!prd) return NextResponse.json({ error: 'PRD 未找到' }, { status: 404 });

  // Resolve parent page ID from URL or legacy field
  const parentInput = parent_page_url || body.parent_page_id || '';
  let parentPageId = '';
  if (parentInput) {
    const resolved = await resolveConfluencePageId(parentInput);
    if (!resolved) {
      return NextResponse.json({ error: '无法从该链接解析出父页面，请检查 URL 格式' }, { status: 400 });
    }
    parentPageId = resolved;
  }

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

  if (parentPageId) {
    payload.ancestors = [{ id: parentPageId }];
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
