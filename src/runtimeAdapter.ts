/**
 * Production runtime integration boundary. The local demo implementation lives
 * separately in demoRuntime.ts so it cannot be mistaken for gateway execution.
 */
import type { WorkflowDocument } from './types';

export interface RuntimeAdapter {
  validate(workflow: WorkflowDocument): Promise<unknown>;
  start(workflow: WorkflowDocument, inputs?: Record<string, unknown>): Promise<unknown>;
  status(runId: string): Promise<unknown>;
  cancel(runId: string): Promise<unknown>;
  /** The demo adapter returns a plain-text log; gateways may return JSON. */
  logs(runId: string): Promise<unknown>;
}

export const RUNTIME_OPERATIONS = ['validate', 'start', 'status', 'cancel', 'logs'] as const;

const normalizeBaseUrl = (baseUrl?: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(String(baseUrl || ''));
  } catch {
    throw new TypeError('Runtime gateway URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Runtime gateway URL must use http or https.');
  }
  return parsed.toString().replace(/\/$/, '');
};

async function readRuntimeResponse(response: Response, operation: string): Promise<unknown> {
  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  if (!response.ok) {
    const shaped = payload as { message?: unknown; error?: unknown } | string | null;
    const detail = typeof shaped === 'string' ? shaped : shaped?.message || shaped?.error;
    throw new Error(`Runtime ${operation} failed (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  return payload;
}

export function assertRuntimeAdapter(adapter: unknown): RuntimeAdapter {
  const candidate = adapter as Partial<RuntimeAdapter> | null | undefined;
  const missing = RUNTIME_OPERATIONS.filter((operation) => typeof candidate?.[operation] !== 'function');
  if (missing.length) throw new TypeError(`Runtime adapter is missing: ${missing.join(', ')}.`);
  return adapter as RuntimeAdapter;
}

export function createRuntimeAdapter(overrides: Partial<RuntimeAdapter> = {}): RuntimeAdapter {
  const unavailable = (operation: string) => async (): Promise<never> => {
    throw new Error(`No workflow runtime is connected; cannot ${operation}.`);
  };

  return assertRuntimeAdapter({
    validate: overrides.validate || unavailable('validate'),
    start: overrides.start || unavailable('start'),
    status: overrides.status || unavailable('read status'),
    cancel: overrides.cancel || unavailable('cancel'),
    logs: overrides.logs || unavailable('read logs'),
  });
}

export interface HttpRuntimeAdapterOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * Connects the editor to a server-side runtime gateway. The gateway owns
 * upstream credentials; this browser adapter only sends workflow data to the
 * configured gateway URL.
 */
export function createHttpRuntimeAdapter({
  baseUrl,
  fetchImpl = globalThis.fetch,
  headers = {},
}: HttpRuntimeAdapterOptions = {}): RuntimeAdapter {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const request = async (operation: string, path: string, method = 'GET', body?: unknown): Promise<unknown> => {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return readRuntimeResponse(response, operation);
  };

  const adapter: RuntimeAdapter = {
    validate: (workflow: WorkflowDocument) => request('validate', '/validate', 'POST', { workflow }),
    start: (workflow: WorkflowDocument, inputs: Record<string, unknown> = {}) =>
      request('start', '/runs', 'POST', { workflow, inputs }),
    status: (runId: string) => request('status', `/runs/${encodeURIComponent(runId)}`),
    cancel: (runId: string) => request('cancel', `/runs/${encodeURIComponent(runId)}`, 'DELETE'),
    logs: (runId: string) => request('logs', `/runs/${encodeURIComponent(runId)}/logs`),
  };

  return assertRuntimeAdapter(adapter);
}
