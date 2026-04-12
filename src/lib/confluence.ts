import { getDb } from './db';

function getConfluenceSettings() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'confluence_%'").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function confFetch(url: string, token: string) {
  return fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
}

export function parseConfluenceUrl(url: string): { spaceKey: string; title: string } | null {
  const m = url.match(/\/display\/([^/]+)\/(.+?)(?:\?|#|$)/);
  if (m) return { spaceKey: m[1], title: decodeURIComponent(m[2].replace(/\+/g, ' ')) };
  const m2 = url.match(/\/spaces\/([^/]+)\/pages\/\d+\/(.+?)(?:\?|#|$)/);
  if (m2) return { spaceKey: m2[1], title: decodeURIComponent(m2[2].replace(/\+/g, ' ')) };
  return null;
}

export async function getPageIdBySpaceAndTitle(spaceKey: string, title: string): Promise<string | null> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return null;
  try {
    const url = `${settings.confluence_base_url}/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}&title=${encodeURIComponent(title)}&limit=1`;
    const res = await confFetch(url, settings.confluence_token);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.id ? String(data.results[0].id) : null;
  } catch { return null; }
}

export async function getChildPageIds(pageId: string): Promise<{ id: string; title: string }[]> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return [];
  const results: { id: string; title: string }[] = [];
  let start = 0;
  const limit = 50;
  try {
    while (true) {
      const url = `${settings.confluence_base_url}/rest/api/content/${pageId}/child/page?limit=${limit}&start=${start}`;
      const res = await confFetch(url, settings.confluence_token);
      if (!res.ok) break;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (data.results || []) as any[]) {
        results.push({ id: String(r.id), title: String(r.title) });
      }
      if (!data.results || data.results.length < limit) break;
      start += limit;
    }
  } catch { /* best effort */ }
  return results;
}

export async function searchConfluencePages(query: string, limit = 5): Promise<{ id: string; title: string; excerpt: string }[]> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return [];
  const cql = encodeURIComponent(`text ~ "${query}" ORDER BY lastModified DESC`);
  const url = `${settings.confluence_base_url}/rest/api/content/search?cql=${cql}&limit=${limit}&expand=body.excerpt`;
  try {
    const res = await confFetch(url, settings.confluence_token);
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.results || []).map((r: any) => ({
      id: String(r.id), title: String(r.title),
      excerpt: stripHtml(String(r.body?.excerpt?.value || '')).slice(0, 300),
    }));
  } catch { return []; }
}

export async function getConfluencePageContent(pageId: string): Promise<string> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return '';
  const url = `${settings.confluence_base_url}/rest/api/content/${pageId}?expand=body.storage,title`;
  try {
    const res = await confFetch(url, settings.confluence_token);
    if (!res.ok) return '';
    const data = await res.json();
    const html = data.body?.storage?.value || '';
    return stripHtml(html);
  } catch { return ''; }
}

export async function getConfluencePageTitle(pageId: string): Promise<string> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return '';
  try {
    const url = `${settings.confluence_base_url}/rest/api/content/${pageId}?expand=title`;
    const res = await confFetch(url, settings.confluence_token);
    if (!res.ok) return '';
    const data = await res.json();
    return data.title || '';
  } catch { return ''; }
}

export interface KbFetchResult {
  contextParts: string[];
  log: { source: string; type: string; status: string; detail: string }[];
}

// ============================================================
// Phase 1: Offline Indexing — recursive crawl of Confluence directory
// ============================================================

export interface IndexStatus {
  kb_source_id: string;
  total_pages: number;
  pages_with_content: number;
  last_indexed: string | null;
}

async function recursiveGetDescendants(
  pageId: string, path: string, maxDepth: number, depth = 0
): Promise<{ id: string; title: string; path: string; depth: number }[]> {
  if (depth >= maxDepth) return [];
  const children = await getChildPageIds(pageId);
  const results: { id: string; title: string; path: string; depth: number }[] = [];
  for (const child of children) {
    const childPath = path ? `${path} > ${child.title}` : child.title;
    results.push({ id: child.id, title: child.title, path: childPath, depth: depth + 1 });
    const grandchildren = await recursiveGetDescendants(child.id, childPath, maxDepth, depth + 1);
    results.push(...grandchildren);
  }
  return results;
}

export async function indexConfluenceKb(
  kbSourceId: string, systemId: string, rawUrl: string,
  onProgress?: (indexed: number, total: number) => void
): Promise<{ total: number; withContent: number }> {
  const db = getDb();
  const parsed = parseConfluenceUrl(rawUrl);
  if (!parsed) throw new Error('无法解析 Confluence URL');

  const parentId = await getPageIdBySpaceAndTitle(parsed.spaceKey, parsed.title);
  if (!parentId) throw new Error(`找不到页面: ${parsed.spaceKey}/${parsed.title}`);

  const allPages = [
    { id: parentId, title: parsed.title, path: parsed.title, depth: 0 },
    ...(await recursiveGetDescendants(parentId, parsed.title, 4)),
  ];

  db.prepare('DELETE FROM kb_page_index WHERE kb_source_id = ?').run(kbSourceId);

  const upsert = db.prepare(`INSERT INTO kb_page_index (id, kb_source_id, system_id, page_id, title, excerpt, path, char_count, depth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let withContent = 0;
  const batchSize = 5;
  for (let i = 0; i < allPages.length; i += batchSize) {
    const batch = allPages.slice(i, i + batchSize);
    const fetches = batch.map(async (page) => {
      const content = await getConfluencePageContent(page.id);
      const excerpt = content.slice(0, 500);
      return { ...page, excerpt, charCount: content.length };
    });
    const results = await Promise.all(fetches);
    for (const r of results) {
      const rowId = `${kbSourceId}_${r.id}`;
      upsert.run(rowId, kbSourceId, systemId, r.id, r.title, r.excerpt, r.path, r.charCount, r.depth);
      if (r.charCount > 0) withContent++;
    }
    onProgress?.(Math.min(i + batchSize, allPages.length), allPages.length);
  }

  return { total: allPages.length, withContent };
}

export function getKbIndexStatus(kbSourceId: string): IndexStatus {
  const db = getDb();
  const stats = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN char_count > 0 THEN 1 ELSE 0 END) as with_content,
    MAX(indexed_at) as last_indexed FROM kb_page_index WHERE kb_source_id = ?`).get(kbSourceId) as {
    total: number; with_content: number; last_indexed: string | null;
  };
  return {
    kb_source_id: kbSourceId,
    total_pages: stats.total || 0,
    pages_with_content: stats.with_content || 0,
    last_indexed: stats.last_indexed,
  };
}

export function getKbIndexStatusBySystem(systemId: string): IndexStatus[] {
  const db = getDb();
  const kbSources = db.prepare("SELECT id FROM kb_sources WHERE system_id = ? AND type = 'confluence'").all(systemId) as { id: string }[];
  return kbSources.map(kb => getKbIndexStatus(kb.id));
}

// ============================================================
// Phase 2: Online Retrieval — keyword extraction + search
// ============================================================

function extractKeywords(text: string, maxKeywords = 8): string[] {
  const cleaned = text
    .replace(/[#*_\-|>]/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ');

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'for',
    'to', 'from', 'by', 'on', 'in', 'at', 'of', 'with', 'as', 'into',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her',
    'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'also',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'any', 'such', 'only', 'own', 'same', 'than', 'about',
    'up', 'out', 'off', 'over', 'under', 'again', 'further',
    'shopee', 'seller', 'buyer', 'order', 'system', 'page', 'data', 'field',
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '他', '她', '它', '们', '我们', '你们', '他们',
  ]);

  const words = cleaned.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));

  const freq = new Map<string, number>();
  for (const w of words) {
    const key = w.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

async function searchIndexedPages(
  systemId: string, keywords: string[], limit = 20
): Promise<{ page_id: string; title: string; score: number }[]> {
  const db = getDb();
  const indexed = db.prepare(
    `SELECT page_id, title, excerpt, char_count FROM kb_page_index WHERE system_id = ? AND char_count > 0`
  ).all(systemId) as { page_id: string; title: string; excerpt: string; char_count: number }[];

  const scored: { page_id: string; title: string; score: number }[] = [];
  for (const page of indexed) {
    let score = 0;
    const lowerTitle = page.title.toLowerCase();
    const lowerExcerpt = page.excerpt.toLowerCase();
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (lowerTitle.includes(kwLower)) score += 3;
      if (lowerExcerpt.includes(kwLower)) score += 1;
    }
    if (score > 0) {
      scored.push({ page_id: page.page_id, title: page.title, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function cqlSearchUnderAncestor(
  keywords: string[], ancestorPageId: string, limit = 20
): Promise<{ page_id: string; title: string; excerpt: string }[]> {
  const settings = getConfluenceSettings();
  if (!settings.confluence_base_url || !settings.confluence_token) return [];

  const queryParts = keywords.slice(0, 5).map(kw => `text ~ "${kw}"`).join(' OR ');
  const cql = encodeURIComponent(`(${queryParts}) AND ancestor = ${ancestorPageId} ORDER BY lastModified DESC`);
  const url = `${settings.confluence_base_url}/rest/api/content/search?cql=${cql}&limit=${limit}&expand=body.excerpt`;

  try {
    const res = await confFetch(url, settings.confluence_token);
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.results || []).map((r: any) => ({
      page_id: String(r.id),
      title: String(r.title),
      excerpt: stripHtml(String(r.body?.excerpt?.value || '')).slice(0, 300),
    }));
  } catch { return []; }
}

// ============================================================
// fetchKbContext — rewritten with two-phase approach
// ============================================================

const MAX_KB_PAGES = 20;
const MAX_CHARS_PER_PAGE = 8000;

export async function fetchKbContext(systemId: string, brdContent?: string): Promise<KbFetchResult> {
  const db = getDb();
  const kbSources = db.prepare("SELECT * FROM kb_sources WHERE system_id = ?").all(systemId) as {
    id: string; type: string; name: string; config: string;
  }[];

  const result: KbFetchResult = { contextParts: [], log: [] };
  const seenPageIds = new Set<string>();
  let totalPagesAdded = 0;

  for (const kb of kbSources) {
    if (totalPagesAdded >= MAX_KB_PAGES) break;

    if (kb.type === 'confluence') {
      let config: Record<string, string> = {};
      try { config = JSON.parse(kb.config); } catch { config = { value: kb.config }; }
      const rawValue = config.page_id || config.value || '';
      const parsed = parseConfluenceUrl(rawValue);

      if (parsed) {
        // Directory mode — use two-phase approach
        const indexCount = (db.prepare(
          'SELECT COUNT(*) as cnt FROM kb_page_index WHERE kb_source_id = ?'
        ).get(kb.id) as { cnt: number }).cnt;

        const parentId = await getPageIdBySpaceAndTitle(parsed.spaceKey, parsed.title);

        if (indexCount === 0) {
          result.log.push({ source: kb.name, type: 'confluence_directory', status: 'no_index',
            detail: '未建立索引，正在实时构建…' });
          if (parentId) {
            try {
              const stats = await indexConfluenceKb(kb.id, systemId, rawValue);
              result.log.push({ source: kb.name, type: 'confluence_directory', status: 'indexed',
                detail: `已索引 ${stats.total} 页 (${stats.withContent} 有内容)` });
            } catch (err) {
              result.log.push({ source: kb.name, type: 'confluence_directory', status: 'index_failed',
                detail: String(err) });
              continue;
            }
          } else {
            result.log.push({ source: kb.name, type: 'confluence_directory', status: 'failed',
              detail: 'Parent page not found' });
            continue;
          }
        }

        const keywords = brdContent ? extractKeywords(brdContent) : [];
        result.log.push({ source: kb.name, type: 'kb_search', status: 'keywords',
          detail: `提取关键词: ${keywords.join(', ') || '(无 BRD 内容)'}` });

        // Channel 1: local index search
        const localResults = keywords.length > 0
          ? await searchIndexedPages(systemId, keywords, MAX_KB_PAGES)
          : [];
        result.log.push({ source: kb.name, type: 'kb_search', status: 'local_matches',
          detail: `本地索引匹配 ${localResults.length} 篇` });

        // Channel 2: CQL search
        let cqlResults: { page_id: string; title: string }[] = [];
        if (keywords.length > 0 && parentId) {
          cqlResults = await cqlSearchUnderAncestor(keywords, parentId, MAX_KB_PAGES);
          result.log.push({ source: kb.name, type: 'kb_search', status: 'cql_matches',
            detail: `CQL 搜索匹配 ${cqlResults.length} 篇` });
        }

        // Merge & deduplicate, local results first (higher relevance score)
        const mergedPageIds: string[] = [];
        for (const r of localResults) {
          if (!seenPageIds.has(r.page_id) && mergedPageIds.length < MAX_KB_PAGES - totalPagesAdded) {
            mergedPageIds.push(r.page_id);
            seenPageIds.add(r.page_id);
          }
        }
        for (const r of cqlResults) {
          if (!seenPageIds.has(r.page_id) && mergedPageIds.length < MAX_KB_PAGES - totalPagesAdded) {
            mergedPageIds.push(r.page_id);
            seenPageIds.add(r.page_id);
          }
        }

        // If we still have room and no keywords matched, fall back to top pages by char_count
        if (mergedPageIds.length === 0) {
          const topPages = db.prepare(
            `SELECT page_id FROM kb_page_index WHERE kb_source_id = ? AND char_count > 0 ORDER BY char_count DESC LIMIT ?`
          ).all(kb.id, MAX_KB_PAGES - totalPagesAdded) as { page_id: string }[];
          for (const p of topPages) {
            if (!seenPageIds.has(p.page_id)) {
              mergedPageIds.push(p.page_id);
              seenPageIds.add(p.page_id);
            }
          }
          result.log.push({ source: kb.name, type: 'kb_search', status: 'fallback',
            detail: `无关键词匹配，使用最大内容页 ${mergedPageIds.length} 篇` });
        }

        // Fetch full content for selected pages (parallel, batch of 5)
        for (let i = 0; i < mergedPageIds.length; i += 5) {
          const batch = mergedPageIds.slice(i, i + 5);
          const fetches = batch.map(async pid => {
            const content = await getConfluencePageContent(pid);
            const title = await getConfluencePageTitle(pid);
            return { pid, title, content };
          });
          const fetched = await Promise.all(fetches);
          for (const f of fetched) {
            if (f.content) {
              const slice = f.content.slice(0, MAX_CHARS_PER_PAGE);
              result.contextParts.push(`### Confluence: ${f.title || f.pid}\n${slice}`);
              totalPagesAdded++;
              result.log.push({ source: f.title || f.pid, type: 'confluence_kb_page', status: 'fetched',
                detail: `${slice.length} chars` });
            }
          }
        }

        result.log.push({ source: kb.name, type: 'confluence_directory', status: 'done',
          detail: `共纳入 ${totalPagesAdded} 篇 KB 文档` });

      } else if (/^\d+$/.test(rawValue)) {
        if (seenPageIds.has(rawValue)) continue;
        const content = await getConfluencePageContent(rawValue);
        if (content) {
          const title = await getConfluencePageTitle(rawValue);
          result.contextParts.push(`### Confluence: ${title || kb.name}\n${content.slice(0, MAX_CHARS_PER_PAGE)}`);
          seenPageIds.add(rawValue);
          totalPagesAdded++;
          result.log.push({ source: kb.name, type: 'confluence_page', status: 'fetched',
            detail: `${content.slice(0, MAX_CHARS_PER_PAGE).length} chars` });
        } else {
          result.log.push({ source: kb.name, type: 'confluence_page', status: 'empty',
            detail: `Page ${rawValue} returned no content` });
        }
      } else {
        const keyword = rawValue || kb.name;
        const searchResults = await searchConfluencePages(keyword, 5);
        for (const sr of searchResults) {
          if (seenPageIds.has(sr.id) || totalPagesAdded >= MAX_KB_PAGES) continue;
          const content = await getConfluencePageContent(sr.id);
          if (content) {
            result.contextParts.push(`### Confluence: ${sr.title}\n${content.slice(0, MAX_CHARS_PER_PAGE)}`);
            seenPageIds.add(sr.id);
            totalPagesAdded++;
          }
        }
        result.log.push({ source: kb.name, type: 'confluence_search', status: 'fetched',
          detail: `${searchResults.length} results for "${keyword}", added ${totalPagesAdded}` });
      }
    } else if (kb.type === 'markdown') {
      let config: Record<string, string> = {};
      try { config = JSON.parse(kb.config); } catch { config = { value: kb.config }; }
      const content = config.content || config.value || '';
      if (content) {
        result.contextParts.push(`### ${kb.name}\n${content.slice(0, MAX_CHARS_PER_PAGE)}`);
        result.log.push({ source: kb.name, type: 'markdown', status: 'loaded', detail: `${content.length} chars` });
      }
    }
  }

  return result;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
