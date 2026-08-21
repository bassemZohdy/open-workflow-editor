# Runtime and persistence boundaries

The browser application is an authoring surface with a deliberately limited local demo engine. It validates and edits Open Workflow documents, and the demo engine simulates task progress, calls, waits, events, failures, and logs without upstream network access. Inline JavaScript tasks are validated as functions receiving `{ input, context, catalogs }` and are sent to the Node sandbox boundary exposed by the development server; object results are merged into demo context. `run.workflow` sub-flows are represented and simulated as catalog-resolved references. Production workflows, credentials, and upstream workflow endpoints remain behind the server-side gateway.

## Runtime contract

An embedding application may provide an adapter with these operations:

- `validate(workflow)`
- `start(workflow, inputs)`
- `status(runId)`
- `cancel(runId)`
- `logs(runId)`

`src/runtimeAdapter.js` validates that contract, supplies a disconnected implementation, and maps the contract to a server-side HTTP gateway. `src/demoRuntime.js` supplies a deterministic browser-local adapter for debug and demonstration only; its UI is labeled DEMO and its mocked calls never leave the browser. The gateway mode remains unavailable until a gateway URL is configured, so demo behavior cannot be mistaken for production execution.

The runtime target is selected in [`runtime-decision.md`](runtime-decision.md). Selecting one is a product and deployment decision that must cover Open Workflow Specification version support, expression semantics, retries, credentials, endpoint policy, and observability. The Node sandbox is a narrow JavaScript task boundary, not a complete production workflow runtime; it must be moved to an isolated process/container or a hardened language runtime before executing hostile multi-tenant code.

## Persistence contract

`src/workflowStore.js` provides the local storage implementation and the `list`/`replace`/`clear` seam used by the editor. `replaceWorkflowRecordsWithState` provides the asynchronous `saving`/`saved`/`error` transition contract, and the UI applies records optimistically before persistence completes. A remote implementation can replace those operations without changing the workflow document or canvas model; it must additionally provide conflict detection and retry behavior before production use.

## Security prerequisites for a future runtime

Before enabling production runtime controls, the integration must define credential storage outside the browser bundle, endpoint allowlists, expression and input handling, audit logging, cancellation authorization, and redaction rules for task inputs, outputs, and logs.

The server-side environment contract is defined in `server/runtimeGatewayConfig.js`. `OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN` is intentionally not a `VITE_` variable and is never included in the public runtime configuration. `VITE_RUNTIME_GATEWAY_URL`, when used, identifies only the browser-to-gateway hop; it is not an upstream credential.
