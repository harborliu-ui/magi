import { getDb } from './db';
import { v4 as uuid } from 'uuid';

interface LogErrorParams {
  source: string;
  endpoint?: string;
  method?: string;
  error: unknown;
  requestBody?: unknown;
  context?: Record<string, unknown>;
  severity?: 'error' | 'warning' | 'critical';
}

/**
 * Strips potentially sensitive info (API keys, internal URLs) from error
 * messages before returning them to the client.
 */
export function sanitizeErrorMessage(err: unknown): string {
  let msg = 'Unknown error';
  if (err instanceof Error) msg = err.message;
  else if (typeof err === 'string') msg = err;
  else msg = JSON.stringify(err);

  // Strip API keys that may appear in error messages
  msg = msg.replace(/(?:api[_-]?key|bearer|token|authorization)[=: ]*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi, '[REDACTED]');
  // Strip full URLs that may expose internal endpoints
  msg = msg.replace(/https?:\/\/[^\s"')]+/g, (url) => {
    try { return new URL(url).hostname; } catch { return '[URL]'; }
  });

  return msg.slice(0, 500);
}

export function logError(params: LogErrorParams): string {
  const id = uuid();
  const db = getDb();

  let errorMessage = 'Unknown error';
  let errorStack = '';

  if (params.error instanceof Error) {
    errorMessage = params.error.message;
    errorStack = params.error.stack || '';
  } else if (typeof params.error === 'string') {
    errorMessage = params.error;
  } else {
    errorMessage = JSON.stringify(params.error);
  }

  try {
    db.prepare(`INSERT INTO error_logs (id, source, endpoint, method, error_message, error_stack, request_body, context, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      params.source,
      params.endpoint || '',
      params.method || '',
      errorMessage,
      errorStack,
      params.requestBody ? JSON.stringify(params.requestBody) : '',
      JSON.stringify(params.context || {}),
      params.severity || 'error'
    );
  } catch {
    console.error('[ErrorLogger] Failed to persist error log:', errorMessage);
  }

  return id;
}
