import { createServer } from 'node:http';
import { createSandboxRequestHandler } from './javascriptSandbox.js';

export function startSandboxServer({ host = '127.0.0.1', port = 8091 } = {}) {
  const handler = createSandboxRequestHandler();
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', 'http://127.0.0.1:5176');
    response.setHeader('access-control-allow-headers', 'content-type');
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }
    void handler(request, response).then((handled) => {
      if (!handled && !response.writableEnded) {
        response.statusCode = 404;
        response.end('Not found');
      }
    });
  });
  server.listen(port, host, () => {
    process.stdout.write(`Open Workflow Node sandbox listening on http://${host}:${port}\n`);
  });
  return server;
}

if (process.argv[1]?.endsWith('/server/index.js')) startSandboxServer();
