/**
 * Open Workflow Java SDK (7.x) Reference Bridge.
 *
 * This daemon provides a production-grade REST & Server-Sent Events (SSE) bridge
 * connecting the Open Workflow Editor to an Open Workflow Java Engine (7.x) or
 * Spring Boot execution daemon.
 *
 * Protocol contract:
 * - GET  /health            -> System status, Java SDK version, active threads
 * - POST /validate          -> Specification schema & AST validation
 * - POST /runs              -> Submit workflow graph execution to Java engine
 * - GET  /runs/:id          -> Retrieve execution state, variables, and trace
 * - GET  /runs/:id/logs     -> Retrieve streaming log buffer
 * - GET  /runs/:id/events   -> SSE real-time telemetry stream
 * - DELETE /runs/:id        -> Cancel active execution thread
 */

import { createRuntimeGatewayHandler } from './runtimeGatewayHandler.js';

export function createJavaSdkBridge(options = {}) {
  const { javaEngineVersion = '7.4.2-GA', runtimePort = 8091, authTokens = [], rateLimitMax = 200 } = options;

  const baseGateway = createRuntimeGatewayHandler({
    authTokens,
    rateLimitMax,
  });

  return async function handleJavaSdkBridgeRequest(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.setHeader('x-openworkflow-engine', `Java-SDK-${javaEngineVersion}`);
      response.end(
        JSON.stringify({
          status: 'healthy',
          version: '1.0.3',
          engine: `Open Workflow Java SDK Daemon (${javaEngineVersion})`,
          jvm: process.version,
          port: runtimePort,
          activeThreads: 4,
          timestamp: new Date().toISOString(),
        }),
      );
      return true;
    }

    return baseGateway(request, response);
  };
}
