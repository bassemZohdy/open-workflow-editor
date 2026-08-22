import { setTimeout } from 'node:timers';

/**
 * @typedef {Object} RuntimeGatewayOptions
 * @property {number} [rateLimitMax]
 * @property {number} [rateLimitWindowMs]
 * @property {string[]} [authTokens]
 */

/**
 * @param {RuntimeGatewayOptions} [options]
 */
export function createRuntimeGatewayHandler(options = {}) {
  const { rateLimitMax = 120, rateLimitWindowMs = 60000, authTokens = [] } = options;
  const runs = new Map();
  const eventListeners = new Map();
  const requestHistory = new Map();
  const auditLogs = [];
  const startTime = Date.now();

  const recordAudit = (entry) => {
    auditLogs.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (auditLogs.length > 100) auditLogs.pop();
  };

  const emitRunEvent = (runId, type, data) => {
    const listeners = eventListeners.get(runId);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener({ type, data });
        } catch {
          // ignore closed socket write
        }
      });
    }
  };

  return async function handleRuntimeGatewayRequest(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const clientIp = request.socket?.remoteAddress || '127.0.0.1';
    const now = Date.now();

    // 1. Rate Limiting
    const timestamps = (requestHistory.get(clientIp) || []).filter((ts) => now - ts < rateLimitWindowMs);
    if (timestamps.length >= rateLimitMax) {
      response.statusCode = 429;
      response.setHeader('content-type', 'application/json');
      response.setHeader('retry-after', '60');
      response.end(
        JSON.stringify({
          error: 'Rate limit exceeded. Too many requests to runtime gateway.',
          retryAfterSeconds: 60,
        }),
      );
      recordAudit({ ip: clientIp, method: request.method, pathname, status: 429 });
      return true;
    }
    timestamps.push(now);
    requestHistory.set(clientIp, timestamps);

    // 2. Authentication Check (if tokens configured)
    if (authTokens.length > 0 && pathname !== '/health') {
      const authHeader = request.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token || !authTokens.includes(token)) {
        response.statusCode = 401;
        response.setHeader('content-type', 'application/json');
        response.setHeader('www-authenticate', 'Bearer');
        response.end(
          JSON.stringify({ error: 'Unauthorized. Valid Bearer token required for gateway access.' }),
        );
        recordAudit({ ip: clientIp, method: request.method, pathname, status: 401 });
        return true;
      }
    }

    if (request.method === 'GET' && pathname === '/health') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          status: 'healthy',
          version: '1.0.3',
          engine: 'Open Workflow Gateway Reference',
          uptimeMs: Date.now() - startTime,
          activeRuns: runs.size,
          authenticated: authTokens.length > 0,
        }),
      );
      recordAudit({ ip: clientIp, method: 'GET', pathname, status: 200 });
      return true;
    }

    if (request.method === 'GET' && pathname === '/audit') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ total: auditLogs.length, entries: auditLogs }));
      return true;
    }

    if (request.method === 'POST' && pathname === '/validate') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        response.statusCode = 400;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        recordAudit({ ip: clientIp, method: 'POST', pathname, status: 400 });
        return true;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          valid: Boolean(body?.workflow?.document?.name || body?.workflow?.do),
          issues: [],
        }),
      );
      recordAudit({ ip: clientIp, method: 'POST', pathname, status: 200 });
      return true;
    }

    if (request.method === 'POST' && pathname === '/runs') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }

      const runId = `gateway-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tasks = Array.isArray(body?.workflow?.do)
        ? body.workflow.do.map((item) => Object.keys(item || {})[0]).filter(Boolean)
        : ['start', 'process', 'finish'];

      const runRecord = {
        runId,
        state: 'running',
        startTime: Date.now(),
        workflowName: body?.workflow?.document?.name || 'workflow',
        tasks,
        currentTask: tasks[0] || 'start',
        trace: [tasks[0] || 'start'],
        logs: [
          `[${new Date().toISOString()}] [INFO] Starting remote workflow run ${runId}`,
          `[${new Date().toISOString()}] [INFO] Executing task: ${tasks[0] || 'start'}`,
        ],
      };

      runs.set(runId, runRecord);

      // Advance task transitions asynchronously
      setTimeout(() => {
        const current = runs.get(runId);
        if (current && current.state === 'running') {
          current.state = 'completed';
          current.trace = tasks;
          current.currentTask = tasks[tasks.length - 1];
          current.logs.push(
            `[${new Date().toISOString()}] [INFO] Completed all ${tasks.length} tasks successfully on gateway.`,
          );
          emitRunEvent(runId, 'completed', current);
        }
      }, 1000);

      response.statusCode = 201;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(runRecord));
      recordAudit({ ip: clientIp, method: 'POST', pathname, status: 201, runId });
      return true;
    }

    if (request.method === 'GET' && pathname.startsWith('/runs/') && pathname.endsWith('/events')) {
      const runId = pathname.replace('/runs/', '').replace('/events', '');
      const runRecord = runs.get(runId);
      if (!runRecord) {
        response.statusCode = 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: `Run ${runId} not found.` }));
        recordAudit({ ip: clientIp, method: 'GET', pathname, status: 404, runId });
        return true;
      }

      response.statusCode = 200;
      response.setHeader('content-type', 'text/event-stream');
      response.setHeader('cache-control', 'no-cache');
      response.setHeader('connection', 'keep-alive');

      const sendEvent = (eventType, data) => {
        response.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('status', runRecord);

      const listener = (event) => {
        sendEvent(event.type, event.data);
        if (event.type === 'completed' || event.type === 'canceled' || event.type === 'failed') {
          cleanup();
          response.end();
        }
      };

      if (!eventListeners.has(runId)) eventListeners.set(runId, new Set());
      eventListeners.get(runId).add(listener);

      const cleanup = () => {
        const listeners = eventListeners.get(runId);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) eventListeners.delete(runId);
        }
      };

      request.on('close', cleanup);
      recordAudit({ ip: clientIp, method: 'GET', pathname, status: 200, runId });
      return true;
    }

    if (request.method === 'GET' && pathname.startsWith('/runs/') && !pathname.endsWith('/logs')) {
      const runId = pathname.replace('/runs/', '');
      const runRecord = runs.get(runId);
      if (!runRecord) {
        response.statusCode = 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: `Run ${runId} not found.` }));
        recordAudit({ ip: clientIp, method: 'GET', pathname, status: 404, runId });
        return true;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(runRecord));
      recordAudit({ ip: clientIp, method: 'GET', pathname, status: 200, runId });
      return true;
    }

    if (request.method === 'DELETE' && pathname.startsWith('/runs/')) {
      const runId = pathname.replace('/runs/', '');
      const runRecord = runs.get(runId);
      if (!runRecord) {
        response.statusCode = 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: `Run ${runId} not found.` }));
        recordAudit({ ip: clientIp, method: 'DELETE', pathname, status: 404, runId });
        return true;
      }
      runRecord.state = 'canceled';
      runRecord.logs.push(`[${new Date().toISOString()}] [WARN] Workflow run cancelled by user.`);
      emitRunEvent(runId, 'canceled', runRecord);
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(runRecord));
      recordAudit({ ip: clientIp, method: 'DELETE', pathname, status: 200, runId });
      return true;
    }

    if (request.method === 'GET' && pathname.startsWith('/runs/') && pathname.endsWith('/logs')) {
      const runId = pathname.replace('/runs/', '').replace('/logs', '');
      const runRecord = runs.get(runId);
      if (!runRecord) {
        response.statusCode = 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: `Run ${runId} not found.` }));
        recordAudit({ ip: clientIp, method: 'GET', pathname, status: 404, runId });
        return true;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(runRecord.logs.join('\n')));
      recordAudit({ ip: clientIp, method: 'GET', pathname, status: 200, runId });
      return true;
    }

    return false;
  };
}
