# Runtime integration security review

## Scope and conclusion

This review covers the editor, the Node JavaScript sandbox, the server-only runtime gateway configuration, authenticated gateway endpoints, and the runtime adapters. The browser-local Demo engine does not execute upstream workflow calls or resolve credentials; it simulates progress and logs, while inline JavaScript tasks are evaluated through the Node sandbox endpoint. Configured production gateways require Bearer token authentication, rate limiting, and structured audit logs.

---

## Findings and Current Controls

| Area                             | Implemented Control                                                                                                                                                                                  | Required Production Hardening                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets                          | `OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN` is server-only; public runtime config omits it. Browser Runtime Panel and Settings dialog allow operator Bearer token entry with isolated `localStorage` scoping. | Store backend upstream secrets in the deployment secret manager, rotate them regularly, and never persist them in workflow text or logs. |
| Endpoints                        | Gateway validates HTTP calls against strict method/path rules.                                                                                                                                       | Enforce a server-side HTTPS allowlist, block loopback/private destinations on production clusters, and apply egress timeouts.            |
| Expressions                      | Expressions remain document data in the editor. Autocomplete safely parses syntax.                                                                                                                   | Permit only the selected runtime’s supported expression engine in a sandbox; never evaluate expressions as browser JavaScript.           |
| JavaScript tasks                 | `run.script` tasks are validated as function expressions and evaluated in a worker with input/code/output limits, a 2000ms timeout, catalog descriptors only, and no Node APIs.                      | Treat Node `vm` as a development boundary only: for hostile multi-tenant code use an isolated container or hardened JS runtime.          |
| Resource catalogs and subflows   | Catalogs are authored as Open Workflow `use.catalogs` references; subflows use `run.workflow`. Subflows can be scaffolded and cross-referenced in visual tabs.                                       | Resolve catalog and subflow references server-side through an allowlist, authenticate access, and prevent recursive execution cycles.    |
| Authentication and authorization | Gateway enforces Bearer token header verification (`401 Unauthorized` on missing/invalid tokens).                                                                                                    | In enterprise deployments, tie Bearer tokens to tenant OAuth2 / OIDC JWT identity providers.                                             |
| Rate limiting & DoS defense      | In-memory sliding-window rate limiter enforces maximum requests per minute (`429 Too Many Requests` with `Retry-After: 60`).                                                                         | In distributed multi-replica gateway clusters, back rate limiting by Redis or API gateway tokens.                                        |
| Audit logging                    | `GET /audit` provides a structured audit log recording timestamp, action, run ID, and client IP.                                                                                                     | Ship structured audit events to SIEM / Elasticsearch with retention rules.                                                               |
| Telemetry & Connections          | Server-Sent Events (SSE) stream (`GET /runs/:id/events`) cleans up client connections on disconnect.                                                                                                 | Enforce heartbeat ping intervals and maximum concurrent client connection limits.                                                        |

---

## Evidence

- Server-side gateway handler: `server/runtimeGatewayHandler.js`
- Java SDK 7.x daemon bridge: `server/javaSdkBridge.js`
- Java SDK gateway guide: `docs/java-sdk-gateway.md`
- Node sandbox boundary: `server/javascriptSandbox.js`
- Browser transport boundary: `src/runtimeAdapter.ts`
- Boundary and credential policy: `docs/runtime-boundary.md`
- Specification expression security guidelines: [Open Workflow DSL runtime expressions](https://github.com/open-workflow-specification/specification/blob/main/dsl.md#runtime-expressions)
