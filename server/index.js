import { createServer } from 'node:http';
import { createSandboxRequestHandler } from './javascriptSandbox.js';
import { createRuntimeGatewayHandler } from './runtimeGatewayHandler.js';

export function startSandboxServer({ host = '127.0.0.1', port = 8091 } = {}) {
  const sandboxHandler = createSandboxRequestHandler();
  const gatewayHandler = createRuntimeGatewayHandler();

  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, authorization, accept');

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }

    void Promise.all([sandboxHandler(request, response), gatewayHandler(request, response)]).then(
      ([sandboxHandled, gatewayHandled]) => {
        if (!sandboxHandled && !gatewayHandled && !response.writableEnded) {
          response.statusCode = 404;
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
      },
    );
  });

  server.listen(port, host, () => {
    process.stdout.write(`Open Workflow server (Sandbox & Gateway) listening on http://${host}:${port}\n`);
  });
  return server;
}

if (process.argv[1]?.endsWith('/server/index.js')) startSandboxServer();
