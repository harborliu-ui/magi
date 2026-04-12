import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { extractDocIdFromUrl, fetchGoogleDocContent, fetchGoogleDocHtml, isGoogleDocUrl } from '@/lib/google-docs';
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
  let sourceUrl = body.source_url || '';
  let reqType = body.type || 'brd';

  if (reqType === 'google_doc' && sourceUrl && isGoogleDocUrl(sourceUrl)) {
    const docId = extractDocIdFromUrl(sourceUrl);
    if (!docId) {
      return NextResponse.json({ error: 'Google Doc URL 格式不正确' }, { status: 400 });
    }
    try {
      content = await fetchGoogleDocContent(docId);
    } catch (err) {
      logError({ source: 'requirements/POST', endpoint: `/api/projects/${id}/requirements`, method: 'POST', error: err, requestBody: body });
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
    try {
      contentHtml = await fetchGoogleDocHtml(docId);
    } catch (err) {
      logError({ source: 'requirements/POST/html', endpoint: `/api/projects/${id}/requirements`, method: 'POST', error: err, severity: 'warning', context: { note: 'HTML export failed, falling back to plain text' } });
    }
  }

  if (!content && sourceUrl && isGoogleDocUrl(sourceUrl)) {
    const docId = extractDocIdFromUrl(sourceUrl);
    if (docId) {
      try {
        content = await fetchGoogleDocContent(docId);
        reqType = 'google_doc';
        try { contentHtml = await fetchGoogleDocHtml(docId); } catch { /* fall through */ }
      } catch { /* fall through */ }
    }
  }

  db.prepare(`INSERT INTO requirements (id, project_id, type, name, content, content_html, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(reqId, id, reqType, body.name, content, contentHtml, sourceUrl);

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
    if (!req.source_url || !isGoogleDocUrl(req.source_url)) {
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
