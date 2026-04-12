import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const saved = Object.fromEntries(rows.map(r => [r.key, r.value]));

  const apiUrl = body.llm_api_url ?? saved.llm_api_url;
  const apiKey = body.llm_api_key ?? saved.llm_api_key;
  const model = body.llm_model ?? saved.llm_model;

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ success: false, error: '请先填写 API 地址和 API Key' });
  }

  const isAnthropic = /anthropic/i.test(apiUrl);

  try {
    if (isAnthropic) {
      const baseUrl = apiUrl.replace(/\/+$/, '');
      const endpoint = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 20,
          messages: [{ role: 'user', content: '请回复"连接成功"两个字' }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const err = await res.text();
        if (res.status === 401) return NextResponse.json({ success: false, error: 'API Key 无效' });
        return NextResponse.json({ success: false, error: `HTTP ${res.status}: ${err.slice(0, 200)}` });
      }
      const data = await res.json();
      return NextResponse.json({ success: true, model: data.model || model, reply: (data.content?.[0]?.text || '').slice(0, 50) });
    }

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ baseURL: apiUrl, apiKey, timeout: 15000 });
    const res = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages: [{ role: 'user', content: '请回复"连接成功"两个字' }],
      max_tokens: 20,
    });
    const reply = res.choices[0]?.message?.content || '';
    return NextResponse.json({ success: true, model: res.model, reply: reply.slice(0, 50) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let hint = '';
    if (msg.includes('401') || msg.includes('Unauthorized')) hint = 'API Key 无效或已过期';
    else if (msg.includes('404')) hint = 'API 地址或模型名称错误';
    else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) hint = 'API 地址无法访问';
    else if (msg.includes('timeout')) hint = '连接超时，请检查网络';
    return NextResponse.json({ success: false, error: hint || msg });
  }
}
