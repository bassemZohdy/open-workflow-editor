/**
 * Production runtime integration boundary. The local demo implementation lives
 * separately in demoRuntime.js so it cannot be mistaken for gateway execution.
 */
export const RUNTIME_OPERATIONS = ['validate', 'start', 'status', 'cancel', 'logs'];

const normalizeBaseUrl = (baseUrl) => {
  let parsed;
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

async function readRuntimeResponse(response, operation) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : payload?.message || payload?.error;
    throw new Error(`Runtime ${operation} failed (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  return payload;
}

export function assertRuntimeAdapter(adapter) {
  const missing = RUNTIME_OPERATIONS.filter((operation) => typeof adapter?.[operation] !== 'function');
  if (missing.length) throw new TypeError(`Runtime adapter is missing: ${missing.join(', ')}.`);
  return adapter;
}

export function createRuntimeAdapter(overrides = {}) {
  const unavailable = (operation) => async () => {
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

/**
 * Connects the editor to a server-side runtime gateway. The gateway owns
 * upstream credentials; this browser adapter only sends workflow data to the
 * configured gateway URL.
 */
export function createHttpRuntimeAdapter({ baseUrl, fetchImpl = globalThis.fetch, headers = {} } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const request = async (operation, path, method = 'GET', body) => {
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

  return assertRuntimeAdapter({
    validate: (workflow) => request('validate', '/validate', 'POST', { workflow }),
    start: (workflow, inputs = {}) => request('start', '/runs', 'POST', { workflow, inputs }),
    status: (runId) => request('status', `/runs/${encodeURIComponent(runId)}`),
    cancel: (runId) => request('cancel', `/runs/${encodeURIComponent(runId)}`, 'DELETE'),
    logs: (runId) => request('logs', `/runs/${encodeURIComponent(runId)}/logs`),
  });
}
