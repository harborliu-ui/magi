import OpenAI from 'openai';
import { getDb } from './db';
import { v4 as uuid } from 'uuid';

function getSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export interface LlmCallMeta {
  projectId?: string;
  phase?: string;
  action?: string;
}

function logLlmCall(
  messages: { role: string; content: string }[],
  response: string,
  model: string,
  durationMs: number,
  meta: LlmCallMeta,
  status: 'success' | 'error' = 'success',
  errorMsg = ''
) {
  try {
    const db = getDb();
    const sysPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userPrompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n---\n');
    const tokensIn = Math.ceil((sysPrompt.length + userPrompt.length) / 4);
    const tokensOut = Math.ceil(response.length / 4);
    db.prepare(`INSERT INTO llm_logs (id, project_id, phase, action, system_prompt, user_prompt, response, model, tokens_in, tokens_out, duration_ms, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), meta.projectId || '', meta.phase || '', meta.action || '',
        sysPrompt.slice(0, 50000), userPrompt.slice(0, 50000), response.slice(0, 50000),
        model, tokensIn, tokensOut, durationMs, status, errorMsg);
  } catch {
    console.error('[LLM Logger] Failed to persist log');
  }
}

function isAnthropicApi(url: string): boolean {
  return /anthropic/i.test(url);
}

async function callAnthropicNative(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const nonSystemMsgs = messages.filter(m => m.role !== 'system');

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
      max_tokens: options?.max_tokens ?? 8000,
      temperature: options?.temperature ?? 0.3,
      system: systemMsg,
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export async function callLLM(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; max_tokens?: number },
  meta?: LlmCallMeta
): Promise<string> {
  const settings = getSettings();
  const model = settings.llm_model || 'gpt-4o';
  const start = Date.now();

  if (!settings.llm_api_url || !settings.llm_api_key) {
    throw new Error('LLM API 未配置。请先在设置页面配置 API URL 和 API Key。');
  }

  try {
    let result: string;

    if (isAnthropicApi(settings.llm_api_url)) {
      result = await callAnthropicNative(
        settings.llm_api_url, settings.llm_api_key,
        settings.llm_model || 'claude-sonnet-4-20250514', messages, options
      );
    } else {
      const client = new OpenAI({
        baseURL: settings.llm_api_url,
        apiKey: settings.llm_api_key,
      });

      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.max_tokens ?? 8000,
      });

      result = response.choices[0]?.message?.content || '';
    }

    logLlmCall(messages, result, model, Date.now() - start, meta || {});
    return result;
  } catch (err) {
    logLlmCall(messages, '', model, Date.now() - start, meta || {}, 'error', String(err));
    throw err;
  }
}

export async function callLLMStream(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<AsyncIterable<string>> {
  const settings = getSettings();

  if (!settings.llm_api_url || !settings.llm_api_key) {
    throw new Error('LLM API 未配置。请先在设置页面配置 API URL 和 API Key。');
  }

  if (isAnthropicApi(settings.llm_api_url)) {
    const result = await callAnthropicNative(
      settings.llm_api_url, settings.llm_api_key,
      settings.llm_model || 'claude-sonnet-4-20250514', messages, options
    );
    return (async function* () { yield result; })();
  }

  const client = new OpenAI({
    baseURL: settings.llm_api_url,
    apiKey: settings.llm_api_key,
  });

  const stream = await client.chat.completions.create({
    model: settings.llm_model || 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.max_tokens ?? 8000,
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  })();
}
