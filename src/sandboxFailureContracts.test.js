import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createSandboxRequestHandler, runSandboxedJavaScript } from '../server/javascriptSandbox';
import {
  publicRuntimeConfig,
  readRuntimeGatewayConfig,
  runtimeRequestHeaders,
} from '../server/runtimeGatewayConfig';

describe('sandbox failure boundaries', () => {
  it('rejects missing code, unsupported languages and excessive code before execution', async () => {
    await expect(runSandboxedJavaScript()).rejects.toMatchObject({ code: 'SANDBOX_CODE_REQUIRED' });
    await expect(runSandboxedJavaScript({ code: '() => 1', language: 'python' })).rejects.toMatchObject({
      code: 'SANDBOX_LANGUAGE_UNSUPPORTED',
    });
    await expect(
      runSandboxedJavaScript({ code: '() => 1', limits: { maxCodeBytes: 1 } }),
    ).rejects.toMatchObject({ code: 'SANDBOX_CODE_TOO_LARGE' });
  });
  it('rejects non-serializable or oversized data in every payload compartment', () => {
    const circular = {};
    circular.self = circular;
    for (const key of ['input', 'context', 'catalogs']) {
      expect(() => runSandboxedJavaScript({ code: '() => 1', [key]: circular })).toThrow(
        'must be JSON serializable',
      );
      expect(() =>
        runSandboxedJavaScript({
          code: '() => 1',
          [key]: { text: 'long value' },
          limits: { maxInputBytes: 2 },
        }),
      ).toThrow('exceeds the configured size limit');
    }
  });
  it('normalizes undefined results, propagates execution errors and enforces output limits', async () => {
    expect(await runSandboxedJavaScript({ code: '() => undefined' })).toBeNull();
    await expect(runSandboxedJavaScript({ code: '42' })).rejects.toThrow('must evaluate to a function');
    await expect(
      runSandboxedJavaScript({ code: '() => { throw new Error("intentional failure"); }' }),
    ).rejects.toThrow('intentional failure');
    await expect(
      runSandboxedJavaScript({ code: '() => "long output"', limits: { maxOutputBytes: 2 } }),
    ).rejects.toThrow('output exceeds');
    await expect(runSandboxedJavaScript({ code: 'async () => 1' })).rejects.toThrow(
      'Async JavaScript is not supported',
    );
  });
  it('keeps dynamic code and Node capabilities unavailable', async () => {
    for (const code of [
      '() => process.env',
      '() => require("node:fs")',
      '() => eval("1")',
      '() => Object.constructor("return 1")()',
    ]) {
      await expect(runSandboxedJavaScript({ code })).rejects.toMatchObject({
        code: 'SANDBOX_BLOCKED_CAPABILITY',
      });
    }
  });
});

describe('sandbox HTTP error contract', () => {
  it('reports interrupted request streams without invoking the executor', async () => {
    const executor = vi.fn(async () => ({}));
    const stream = Object.assign(
      new Readable({
        read() {
          this.destroy(new Error('socket closed'));
        },
      }),
      { method: 'POST', url: '/api/sandbox/javascript' },
    );
    const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await createSandboxRequestHandler({ executor })(stream, response);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.end.mock.calls[0][0]).code).toBe('REQUEST_READ_FAILED');
    expect(executor).not.toHaveBeenCalled();
  });
  async function request(
    body,
    executor = vi.fn(async () => ({ value: 1 })),
    method = 'POST',
    url = '/api/sandbox/javascript',
  ) {
    const stream = Object.assign(Readable.from([body]), { method, url });
    const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    const handled = await createSandboxRequestHandler({ executor })(stream, response);
    return { handled, response, executor };
  }
  it('serves health and leaves unrelated routes to the caller', async () => {
    const health = await request('', undefined, 'GET', '/health');
    expect(health.response.statusCode).toBe(200);
    expect(health.executor).not.toHaveBeenCalled();
    expect((await request('', undefined, 'GET', '/other')).handled).toBe(false);
  });
  it('leaves requests without a URL to the caller without executing code', async () => {
    const executor = vi.fn();
    const stream = Object.assign(Readable.from([]), { method: 'GET' });
    const response = { setHeader: vi.fn(), end: vi.fn() };
    expect(await createSandboxRequestHandler({ executor })(stream, response)).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized bodies while retaining error codes', async () => {
    const malformed = await request('{');
    expect(malformed.response.statusCode).toBe(400);
    expect(JSON.parse(malformed.response.end.mock.calls[0][0]).code).toBe('INVALID_JSON');
    expect(malformed.executor).not.toHaveBeenCalled();
    const oversized = await request('x'.repeat(64_001));
    expect(oversized.response.statusCode).toBe(413);
    expect(oversized.executor).not.toHaveBeenCalled();
  });
  it('accepts an empty JSON object and maps executor input-limit failures to 413', async () => {
    const empty = await request('');
    expect(empty.executor).toHaveBeenCalledWith({});
    expect(empty.response.statusCode).toBe(200);
    const rejectInput = vi.fn(async () => {
      throw Object.assign(new Error('Input too large'), { code: 'SANDBOX_INPUT_TOO_LARGE' });
    });
    expect((await request('{}', rejectInput)).response.statusCode).toBe(413);
    const rejectExecution = vi.fn(async () => {
      throw new Error('execution rejected');
    });
    expect((await request('{}', rejectExecution)).response.statusCode).toBe(400);
    const rejectWithoutMessage = vi.fn(async () => {
      throw new Error('');
    });
    const blank = await request('{}', rejectWithoutMessage);
    expect(JSON.parse(blank.response.end.mock.calls[0][0]).error).toBe('Sandbox request failed.');
  });
});

describe('runtime credentials stay in server configuration', () => {
  it('rejects invalid protocols and malformed URLs', () => {
    for (const value of ['not a url', 'file:///private', 'ftp://example.test']) {
      expect(() => readRuntimeGatewayConfig({ OPEN_WORKFLOW_RUNTIME_BASE_URL: value })).toThrow();
    }
  });
  it('keeps disabled and unauthenticated configurations explicit', () => {
    const disabled = readRuntimeGatewayConfig();
    expect(disabled.enabled).toBe(false);
    expect(publicRuntimeConfig(disabled)).toEqual({
      enabled: false,
      baseUrl: null,
      name: 'Open Workflow Java runtime',
    });
    const disabledWithToken = readRuntimeGatewayConfig({
      OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN: 'fixture-token',
    });
    expect(disabledWithToken.enabled).toBe(false);
    expect(JSON.stringify(publicRuntimeConfig(disabledWithToken))).not.toContain('fixture-token');
    const configured = readRuntimeGatewayConfig({
      OPEN_WORKFLOW_RUNTIME_BASE_URL: 'https://example.test/',
      OPEN_WORKFLOW_RUNTIME_NAME: ' Test runtime ',
    });
    expect(configured.baseUrl).toBe('https://example.test');
    expect(runtimeRequestHeaders(configured, { accept: 'application/json' })).not.toHaveProperty(
      'authorization',
    );
  });
  it('adds the server token to upstream requests and never to public metadata', () => {
    const config = readRuntimeGatewayConfig({
      OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN: 'fixture-token',
      OPEN_WORKFLOW_RUNTIME_BASE_URL: 'http://example.test',
    });
    expect(runtimeRequestHeaders(config).authorization).toBe('Bearer fixture-token');
    expect(publicRuntimeConfig(config)).not.toHaveProperty('authToken');
    expect(JSON.stringify(publicRuntimeConfig(config))).not.toContain('fixture-token');
  });
});
