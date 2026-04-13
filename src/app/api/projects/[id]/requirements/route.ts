import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { extractDocIdFromUrl, fetchGoogleDocContent, fetchGoogleDocHtml, isGoogleDocUrl } from '@/lib/google-docs';
import { getConfluencePageContent, resolveConfluencePageId } from '@/lib/confluence';
import { logError } from '@/lib/error-logger';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json(
    getDb().prepare('SELECT * FROM requirements WHERE project_id = ? ORDER BY created_at').all(id)
  );
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const reqId = uuid();
  const db = getDb();

  let content = body.content || '';
  let contentHtml = '';
  const sourceUrl = body.source_url || '';
  const reqType = body.type || 'core';
  const sourceType = body.source_type || 'text';
  const referenceNote = body.reference_note || '';
  const name = body.name || '';

  if (sourceType === 'google_doc' && sourceUrl) {
    const docUrl = sourceUrl.trim();
    if (!isGoogleDocUrl(docUrl)) {
      return NextResponse.json({ error: 'Google Doc URL 格式不正确' }, { status: 400 });
    }
    const docId = extractDocIdFromUrl(docUrl);
    if (!docId) {
      return NextResponse.json({ error: '无法从 URL 中提取文档 ID' }, { status: 400 });
    }
    try {
      content = await fetchGoogleDocContent(docId);
    } catch (err) {
      logError({ source: 'requirements/POST', endpoint: `/api/projects/${id}/requirements`, method: 'POST', error: err, requestBody: body });
      return NextResponse.json({ error: `Google Doc 拉取失败: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    try {
      contentHtml = await fetchGoogleDocHtml(docId);
    } catch (err) {
      logError({ source: 'requirements/POST/html', endpoint: `/api/projects/${id}/requirements`, method: 'POST', error: err, severity: 'warning', context: { note: 'HTML export failed' } });
    }
  } else if (sourceType === 'confluence' && sourceUrl) {
    try {
      const pageId = await resolveConfluencePageId(sourceUrl.trim());
      if (!pageId) {
        return NextResponse.json({ error: '无法从该链接解析出 Confluence 页面' }, { status: 400 });
      }
      content = await getConfluencePageContent(pageId);
      if (!content) {
        return NextResponse.json({ error: 'Confluence 页面内容为空' }, { status: 400 });
      }
    } catch (err) {
      logError({ source: 'requirements/POST/confluence', endpoint: `/api/projects/${id}/requirements`, method: 'POST', error: err, requestBody: body });
      return NextResponse.json({ error: `Confluence 拉取失败: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
  }

  db.prepare(`INSERT INTO requirements (id, project_id, type, source_type, name, content, content_html, source_url, reference_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(reqId, id, reqType, sourceType, name, content, contentHtml, sourceUrl, referenceNote);

  return NextResponse.json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(reqId), { status: 201 });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  await ctx.params;
  const body = await request.json();
  if (!body.requirement_id) return NextResponse.json({ error: 'requirement_id required' }, { status: 400 });
  const db = getDb();
  const req = db.prepare('SELECT * FROM requirements WHERE id = ?').get(body.requirement_id) as Record<string, string> | undefined;
  if (!req) return NextResponse.json({ error: '文档不存在' }, { status: 404 });

  if (body.action === 'refresh_html') {
    if (req.source_type !== 'google_doc' || !req.source_url || !isGoogleDocUrl(req.source_url)) {
      return NextResponse.json({ error: '仅支持 Google Doc 来源的文档刷新格式' }, { status: 400 });
    }
    const docId = extractDocIdFromUrl(req.source_url);
    if (!docId) return NextResponse.json({ error: 'Google Doc URL 解析失败' }, { status: 400 });
    try {
      const html = await fetchGoogleDocHtml(docId);
      db.prepare('UPDATE requirements SET content_html = ? WHERE id = ?').run(html, body.requirement_id);
      return NextResponse.json({ success: true, html_length: html.length });
    } catch (err) {
      logError({ source: 'requirements/PUT/refresh_html', error: err, severity: 'warning' });
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  await ctx.params;
  const body = await request.json();
  if (!body.requirement_id) return NextResponse.json({ error: 'requirement_id required' }, { status: 400 });
  getDb().prepare('DELETE FROM requirements WHERE id = ?').run(body.requirement_id);
  return NextResponse.json({ ok: true });
}
