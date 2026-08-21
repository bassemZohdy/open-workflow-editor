# Runtime integration security review

## Scope and conclusion

This review covers the editor, the Node JavaScript sandbox, the server-only runtime gateway configuration, and the runtime adapters. The browser-local Demo engine does not execute upstream workflow calls or resolve credentials; it simulates progress and logs, while inline JavaScript tasks are evaluated through the narrow Node sandbox endpoint. A configured gateway is a separate production boundary and must pass the controls below before it is trusted.

## Findings and required controls

| Area                             | Current control                                                                                                                                                                                     | Required before execution                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets                          | `OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN` is server-only; `publicRuntimeConfig` omits it; no `VITE_` token is defined.                                                                                     | Store secrets in the deployment secret manager, rotate them, and never persist them in workflow text, local storage, or logs.                                                                                          |
| Endpoints                        | The editor can author endpoint strings but does not call them.                                                                                                                                      | Enforce a server-side HTTPS allowlist, block loopback/private/link-local destinations, validate DNS after resolution, restrict redirects, and apply timeouts/egress policy.                                            |
| Expressions                      | Expressions remain document data in the editor. The specification warns that runtime expressions can expose injection and secret-leak risks.                                                        | Permit only the selected runtime’s supported expression language in a sandbox; never evaluate expressions as browser JavaScript; constrain `$secrets` access and redact expression inputs/outputs.                     |
| JavaScript tasks                 | `run.script` tasks are validated as function expressions and evaluated in a worker with input/code/output limits, a timeout, catalog descriptors only, and no intentionally exposed Node APIs.      | Treat Node `vm` as a development boundary only: for hostile or multi-tenant code use an isolated process/container or hardened JS runtime, deny network/filesystem/secrets, enforce quotas, and audit every execution. |
| Resource catalogs and sub-flows  | Catalogs are authored as Open Workflow `use.catalogs` references; sub-flows use `run.workflow` with namespace/name/version/input. Demo mode never resolves catalog endpoints or executes sub-flows. | Resolve catalog and sub-flow references server-side through an allowlist, authenticate and authorize access, validate target workflow inputs, prevent recursive abuse, and audit resolution and execution.             |
| Authentication and authorization | No runtime credentials are available to the browser.                                                                                                                                                | Require authenticated gateway requests, authorize workflow/run access by tenant and role, and separately authorize cancellation and log access.                                                                        |
| Logs and data                    | Demo logs are local simulated diagnostics; gateway logs are pass-through runtime data.                                                                                                              | Redact credentials, authorization headers, tokens, and sensitive task data before storage or display; define retention and audit events.                                                                               |
| Browser boundary                 | The HTTP adapter sends only workflow data to a configured gateway URL.                                                                                                                              | Allow only the gateway origin with production CORS/CSRF policy; do not expose upstream runtime headers or credentials.                                                                                                 |

## Release gate

The gateway execution path must remain unavailable for production use until an integration test proves: authenticated validation, an allowlisted endpoint call, expression isolation, sandboxed JavaScript behavior, redacted logs, tenant-scoped status/cancel/log access, and failure-safe timeout behavior. The gateway must reject unsupported DSL versions before execution.

## Evidence

- Server-only configuration: `server/runtimeGatewayConfig.js`
- Node sandbox boundary: `server/javascriptSandbox.js`
- Browser transport boundary: `src/runtimeAdapter.js`
- Boundary and credential policy: `docs/runtime-boundary.md`
- The specification’s expression warning: [Open Workflow DSL runtime expressions](https://github.com/open-workflow-specification/specification/blob/main/dsl.md#runtime-expressions)
