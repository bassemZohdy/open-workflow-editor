# Open Workflow Editor

Local browser-based authoring UI for the [Open Workflow Specification](https://github.com/open-workflow-specification/specification). The editor uses `@openworkflowspec/sdk` for schema validation and semantic graph data, `@xyflow/react` for the editable canvas, and ELK.js for auto-layout.

This project is an authoring tool with an optional local demo engine. The demo engine simulates workflow
progress in the browser; it does not execute production workflows, resolve credentials, or call upstream
endpoints. JavaScript tasks use the local Node sandbox boundary during development. Production execution
remains a separate server-side runtime gateway integration.

## Development

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. The primary workflow is:

1. Drag tasks from the palette onto the canvas.
2. Move nodes, connect handles, select a task, and edit its inspector fields.
3. Use the Specification tab for YAML or JSON editing with live validation.
4. Save locally, or import/export a workflow file.

The Vite development server exposes the Node sandbox at `POST /api/sandbox/javascript`. To run the same
boundary as a standalone local service, use `npm run runtime:sandbox` (listens on `127.0.0.1:8091`).

The Inspector exposes shared options for every task: conditions, next-task routing, ISO duration controls for waits and timeouts, typed input/output/export mappings, and metadata. Task-specific editors add the fields that belong to that task; HTTP calls include method, endpoint, headers, query parameters, and a key/value JSON builder with text, number, boolean, date, date-time, time, expression, and nested JSON types. Advanced task JSON remains available for less common schema fields.

Workflow validation is an editor command in the top bar; it checks the definition without executing it. Runtime is reserved for execution: **Start run** executes it in the selected engine, while **Cancel run** and **Refresh status** appear only after a run has started. Inspector and Runtime collapse independently as vertical right-side panels, matching the task palette behavior. Next-task routing uses the current workflow’s available task list, and HTTP request parameters are grouped in a collapsible section with name/value fields for headers and query parameters.

The workflow picker contains four focused Dubai Government service cases: RTA nol Travel Pass renewal, RTA vehicle ownership renewal, RTA personal and family nol card renewal, and DEWA Move-To. Each stays intentionally short while showing the trigger, identity/payment step, service transition, and notification. Every example links to its official service reference. In Demo mode, use **Demo pace** to choose Fast, Steady, or Slow task progression. The Runtime panel shows the active task, task durations, branch choices, mocked service calls, trigger type, and a structured execution log with expandable entries.

Saved workflows can be selected from the workflow picker, renamed inline, duplicated, or deleted. Switching workflows and destructive lifecycle actions ask before discarding unsaved changes.

For a `switch` task, select the node to open its case editor. Add cases with `＋ Add case` or drag `Drag “New case” here` into the drop zone, then edit each condition and flow target.

The editor shows explicit hydration/import progress, empty-canvas guidance, parse/validation errors, and unsupported-task feedback while keeping the last editable specification draft visible.

`Run JavaScript` tasks use the Open Workflow `run.script` shape and require a function such as `({ input, context, catalogs }) => output`. The editor validates the function syntax, exposes workflow `use.catalogs` resource references, and merges object output into context for the next task. The same Run task can target a schema-valid `run.workflow` sub-flow. In the Vite development server, JavaScript is sent to the Node sandbox endpoint with strict limits. Deployments must keep this boundary isolated before accepting untrusted workflow authors.

Useful shortcuts are `⌘/Ctrl+Z` undo, `Shift+⌘/Ctrl+Z` redo, `⌘/Ctrl+S` save, `⌘/Ctrl+D` duplicate the selected task, and `F` fit the canvas.

## Verification commands

```bash
npm test
npm run test:browser
npm run build
npm run typecheck
npm run lint
npm run format:check
```

The adapter tests cover YAML/JSON round-trips, all supported task templates, graph projection, layout, task mutations, graph diagnostics, lifecycle storage, and nested field edits. Playwright covers palette keyboard creation, property/spec synchronization, drag/drop, invalid-specification feedback, and workflow duplication.

## Persistence

Saved workflow text is kept in browser local storage with a versioned envelope. Canvas positions are stored separately so layout changes do not modify the Open Workflow document. The old unversioned text format is read as a migration fallback.

The runtime and persistence integration boundary is documented in [`docs/runtime-boundary.md`](docs/runtime-boundary.md). The selected execution target and compatibility gate are recorded in [`docs/runtime-decision.md`](docs/runtime-decision.md), and the pre-execution security review is in [`docs/security-review.md`](docs/security-review.md). Runtime credentials belong to the server-only environment contract in `server/runtimeGatewayConfig.js`; never expose them through a `VITE_` variable. The Runtime panel defaults to the local demo engine and can switch to the gateway when `VITE_RUNTIME_GATEWAY_URL` is configured.
