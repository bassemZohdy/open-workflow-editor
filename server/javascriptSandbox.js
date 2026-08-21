import { Worker } from 'node:worker_threads';
import { Buffer } from 'node:buffer';
import { clearTimeout, setTimeout } from 'node:timers';

export const SANDBOX_LIMITS = {
  timeoutMs: 400,
  maxCodeBytes: 8_000,
  maxInputBytes: 32_000,
  maxOutputBytes: 32_000,
};

const WORKER_SOURCE = String.raw`
  const { parentPort, workerData } = await import('node:worker_threads');
  const { Script, createContext } = await import('node:vm');

  try {
    const sandbox = Object.create(null);
    sandbox.input = workerData.input;
    sandbox.context = workerData.context;
    sandbox.catalogs = workerData.catalogs;
    const context = createContext(sandbox, { name: 'open-workflow-javascript' });
    const userFunction = new Script('(' + workerData.code + ')', { filename: 'workflow-script.js' }).runInContext(context, {
      timeout: workerData.timeoutMs,
    });
    if (typeof userFunction !== 'function') {
      throw new Error('JavaScript task code must evaluate to a function.');
    }
    const value = userFunction({
      input: workerData.input,
      context: workerData.context,
      catalogs: workerData.catalogs,
    });
    if (value && typeof value.then === 'function') {
      throw new Error('Async JavaScript is not supported by the sandbox.');
    }
    const serialized = JSON.stringify(value === undefined ? null : value);
    if (Buffer.byteLength(serialized, 'utf8') > workerData.maxOutputBytes) {
      throw new Error('Sandbox output exceeds the configured limit.');
    }
    parentPort.postMessage({ ok: true, result: JSON.parse(serialized) });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error?.message || 'Sandbox execution failed.' });
  }
`;

const byteLength = (value) => Buffer.byteLength(String(value || ''), 'utf8');

export class SandboxExecutionError extends Error {
  constructor(message, code = 'SANDBOX_EXECUTION_FAILED') {
    super(message);
    this.name = 'SandboxExecutionError';
    this.code = code;
  }
}

function assertJsonValue(value, label, maxBytes) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    throw new SandboxExecutionError(`${label} must be JSON serializable.`, 'SANDBOX_INVALID_INPUT');
  }
  if (byteLength(serialized) > maxBytes) {
    throw new SandboxExecutionError(`${label} exceeds the configured size limit.`, 'SANDBOX_INPUT_TOO_LARGE');
  }
  return JSON.parse(serialized);
}

function assertSourceIsRestricted(code) {
  const blocked =
    /(?:\b(?:process|require|globalThis|global|eval|Function|import|export|constructor|prototype)\b|__proto__|node:)/;
  if (blocked.test(code)) {
    throw new SandboxExecutionError(
      'The script uses a blocked Node or dynamic-code capability.',
      'SANDBOX_BLOCKED_CAPABILITY',
    );
  }
}

export function runSandboxedJavaScript({
  code,
  language = 'javascript',
  input = {},
  context = {},
  catalogs = {},
  limits = {},
} = {}) {
  if (language !== 'javascript') {
    return Promise.reject(
      new SandboxExecutionError(
        'Only JavaScript is enabled by the Node sandbox.',
        'SANDBOX_LANGUAGE_UNSUPPORTED',
      ),
    );
  }

  const mergedLimits = { ...SANDBOX_LIMITS, ...limits };
  const source = String(code || '').trim();
  if (!source) {
    return Promise.reject(new SandboxExecutionError('JavaScript code is required.', 'SANDBOX_CODE_REQUIRED'));
  }
  if (byteLength(source) > mergedLimits.maxCodeBytes) {
    return Promise.reject(
      new SandboxExecutionError('JavaScript code exceeds the configured limit.', 'SANDBOX_CODE_TOO_LARGE'),
    );
  }
  try {
    assertSourceIsRestricted(source);
  } catch (error) {
    return Promise.reject(error);
  }

  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      code: source,
      input: assertJsonValue(input, 'Input', mergedLimits.maxInputBytes),
      context: assertJsonValue(context, 'Context', mergedLimits.maxInputBytes),
      catalogs: assertJsonValue(catalogs, 'Catalogs', mergedLimits.maxInputBytes),
      timeoutMs: mergedLimits.timeoutMs,
      maxOutputBytes: mergedLimits.maxOutputBytes,
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
      void worker.terminate();
    };

    const timer = setTimeout(() => {
      finish(reject, new SandboxExecutionError('Sandbox execution timed out.', 'SANDBOX_TIMEOUT'));
    }, mergedLimits.timeoutMs + 100);

    worker.once('message', (message) => {
      clearTimeout(timer);
      if (message.ok) finish(resolve, message.result);
      else {
        const timedOut = /timed out/i.test(message.error || '');
        finish(
          reject,
          new SandboxExecutionError(
            timedOut ? 'Sandbox execution timed out.' : message.error,
            timedOut ? 'SANDBOX_TIMEOUT' : 'SANDBOX_EXECUTION_FAILED',
          ),
        );
      }
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      finish(reject, new SandboxExecutionError(error.message));
    });
    worker.once('exit', (exitCode) => {
      clearTimeout(timer);
      if (exitCode !== 0 && !settled) {
        finish(reject, new SandboxExecutionError(`Sandbox worker exited with code ${exitCode}.`));
      }
    });
  });
}

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (byteLength(body) > maxBytes)
        reject(new SandboxExecutionError('Request body is too large.', 'REQUEST_TOO_LARGE'));
    });
    request.once('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new SandboxExecutionError('Request body must be valid JSON.', 'INVALID_JSON'));
      }
    });
    request.once('error', () =>
      reject(new SandboxExecutionError('Could not read request body.', 'REQUEST_READ_FAILED')),
    );
  });
}

export function createSandboxRequestHandler({ executor = runSandboxedJavaScript } = {}) {
  return async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      writeJson(response, 200, { ok: true, service: 'open-workflow-node-sandbox' });
      return true;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/sandbox/javascript') return false;

    try {
      const body = await readJsonBody(request, SANDBOX_LIMITS.maxInputBytes * 2);
      const result = await executor(body);
      writeJson(response, 200, { ok: true, result });
    } catch (error) {
      const statusCode =
        error.code === 'SANDBOX_INPUT_TOO_LARGE' || error.code === 'REQUEST_TOO_LARGE' ? 413 : 400;
      writeJson(response, statusCode, {
        ok: false,
        error: error.message || 'Sandbox request failed.',
        code: error.code,
      });
    }
    return true;
  };
}
