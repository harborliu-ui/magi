import { NextRequest, NextResponse } from 'next/server';
import { resolveConfluencePageId, getConfluencePageContent } from '@/lib/confluence';

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input') || '';
  if (!input.trim()) {
    return NextResponse.json({ error: '请提供 Confluence 页面链接或 ID' }, { status: 400 });
  }

  try {
    const pageId = await resolveConfluencePageId(input);
    if (!pageId) {
      return NextResponse.json({ error: '无法从该链接中解析出页面，请检查链接格式' }, { status: 400 });
    }

    const content = await getConfluencePageContent(pageId);
    const titleMatch = content?.match(/^#\s*(.+)/m);

    return NextResponse.json({
      page_id: pageId,
      title: titleMatch?.[1] || `Page ${pageId}`,
      content_length: content?.length || 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '解析失败' }, { status: 500 });
  }
}
