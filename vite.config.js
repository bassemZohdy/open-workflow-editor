import { defineConfig } from 'vite';
import { createSandboxRequestHandler } from './server/javascriptSandbox.js';

function nodeSandboxPlugin() {
  return {
    name: 'open-workflow-node-sandbox',
    configureServer(server) {
      const handler = createSandboxRequestHandler();
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (pathname !== '/health' && pathname !== '/api/sandbox/javascript') {
          next();
          return;
        }
        void handler(request, response).then((handled) => {
          if (!handled && !response.writableEnded) next();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [nodeSandboxPlugin()],
  build: {
    // The pinned ELK editor profile remains lazy; size-limit counts it with all other JS.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[/\\/](react|react-dom|scheduler)[/\\/]/ },
            { name: 'vendor-xyflow', test: /node_modules[/\\/]@xyflow[/\\/]/ },
            { name: 'vendor-workflow-sdk', test: /node_modules[/\\/](@openworkflowspec|js-yaml)[/\\/]/ },
          ],
        },
      },
    },
  },
});
