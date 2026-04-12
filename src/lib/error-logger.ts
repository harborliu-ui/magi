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
