# Runtime and persistence boundaries

The browser application is an authoring surface with a deliberately limited local demo engine and a production runtime gateway client. It validates and edits Open Workflow documents, and the demo engine simulates task progress, calls, waits, events, failures, and logs without upstream network access. Inline JavaScript tasks are validated as functions receiving `{ input, context, catalogs }` and are evaluated in the local Node sandbox boundary exposed by the development server; object results are merged into context and become the task's output (`$context.<scriptTask>.field` resolves — the AI contracts depend on this). `run.workflow` subflows are cross-referenced and scaffolded directly from the inspector; when the referenced document exists in the workspace (open tab or saved library, matched by `namespace`+`name`), the demo engine **executes** it (child context seeded from the parent, steps/logs scoped in the same run, nesting depth guard), falling back to contract-shaped mocks for AI delegations without a document. The run output (final context) is displayed in the runtime panel. Production workflows, credentials, and upstream workflow endpoints remain behind the server-side gateway.

---

## Runtime Gateway Contract

The production runtime gateway exposes the following HTTP endpoints:

- `GET /health` — Gateway status, Open Workflow Specification version, JVM/Node metadata, and live active run count.
- `GET /audit` — Structured audit trail recording timestamp, operation, run ID, and client IP.
- `POST /validate` — Validates workflow AST and JSON/YAML document against the Open Workflow Specification (1.0.3).
- `POST /runs` — Submits workflow definition and input payload for execution.
- `GET /runs/:id` — Queries real-time status and state transitions.
- `GET /runs/:id/logs` — Retrieves execution log stream.
- `GET /runs/:id/events` — Server-Sent Events (SSE) telemetry stream (`text/event-stream`) broadcasting real-time progress events.
- `DELETE /runs/:id` — Cancels an active execution thread.
- `POST /ai/chat` — AI LLM chat through the server-side provider bridge (see [`docs/ai-tasks.md`](ai-tasks.md)); `200 { ok, result: { completion, model, usage } }`, `400` invalid payload, `503` provider not configured, `502` provider error.
- `POST /ai/agent` — AI agent run through the same bridge; `200 { ok, result: { steps, outcome } }` with the same error mapping.

The gateway supports configurable Bearer token authorization (`Authorization: Bearer <token>`), in-memory sliding-window rate limiting (`429 Too Many Requests`), audit entries on every AI call (`aiKind: chat | agent`), and CORS pre-flight handling.

---

## Open Workflow Java SDK (7.x) Integration

For enterprise deployments running the Open Workflow Java SDK (7.x) execution engine, the editor connects to the daemon via the REST/SSE bridge:

- Reference bridge script: `server/javaSdkBridge.js`
- Full integration and Spring Boot configuration guide: [`docs/java-sdk-gateway.md`](java-sdk-gateway.md)

---

## Persistence Contract

`src/workflowStore.ts` provides the local storage implementation and the `list`/`replace`/`clear` seam used by the editor. `replaceWorkflowRecordsWithState` provides the asynchronous `saving`/`saved`/`error` transition contract, and the UI applies records optimistically before persistence completes. In-memory tab states are preserved across multi-document tab switches. The native Web File System Access API (`src/fileSystemAdapter.ts`) enables direct local file open and save operations.

---

## Security Architecture

1. **Server-Side Secrets:** Upstream credentials remain in the server environment (`server/runtimeGatewayConfig.js`, `server/aiProviderBridge.js` — `AI_PROVIDER_API_KEY` / `AI_PROVIDER_BASE_URL` or an injected `aiProviderConfig`); provider keys never come from workflow documents or client requests.
2. **Client Authorization:** The browser Runtime Panel and the Settings dialog (`Ctrl/Cmd+,`) allow operators to configure a custom Gateway URL and Bearer Auth Token with `localStorage` persistence; Settings broadcasts the change so the Runtime console picks it up live (`open-workflow:gateway-config-changed`).
3. **Execution Sandbox Isolation:** Node `vm` workers are isolated to development simulation; production execution is delegated to the hardened Java/Go engine daemon.
