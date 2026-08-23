# Open Workflow Editor

A production-grade browser-based visual authoring and simulation environment for the [Open Workflow Specification (1.0.3)](https://github.com/open-workflow-specification/specification). The editor uses `@openworkflowspec/sdk` for AST parsing, schema validation, and semantic graph generation, `@xyflow/react` for interactive canvas editing, and ELK.js for deterministic hierarchical layout.

---

## Core Capabilities

- **Visual Canvas Authoring:** Interactive drag-and-drop workflow canvas with 12 complete task types (`set`, `call`, `switch`, `do`, `for`, `fork`, `emit`, `listen`, `raise`, `run`, `try`, `wait`), auto-layout with ELK.js, node alignment tools, search/filter, and high-resolution SVG/PNG diagram export.
- **Hierarchical Container Sub-Graph Visualization:** Container nodes (`do`, `for`, `fork`, `try`/`catch`, `switch`) render nested task pills, branch targets, and normalized container icons.
- **Reusable Functions & Function Invocations:** Document-level `use.functions` manager, dual-mode `call` task inspector (`HTTP Request` vs `Reusable Function`), graph validation against undefined function targets, and distinctive canvas subtitle indicators (`fn: <functionName>`).
- **Multi-Document Tabs & Local File System Sync:** Horizontal document tabs with dirty state indicators, "+ New tab", in-memory tab state preservation across tab switches, and native Web File System Access API integration (`showOpenFilePicker` / `showSaveFilePicker`).
- **Deep Property Inspectors:** Dedicated inspectors for all 12 task primitives, multi-key `JsonObjectBuilder` for `set` tasks, typed JSON builder, and dynamic expression autocomplete (`${ ... }`).
- **Subflow Visual Cross-Referencing & Scaffolding:** 1-click tab switching and scaffolding for `run.workflow` subflows directly from property inspectors.
- **Production Runtime Gateway & Live Telemetry:** Connects to remote execution daemons via authenticated REST and Server-Sent Events (SSE) stream (`GET /runs/:id/events`). Includes live health card with latency ping (ms), uptime, active runs, Bearer token authorization, in-memory sliding window rate limiting, and audit logging (`GET /audit`).
- **Open Workflow Java SDK (7.x) Integration:** Reference daemon bridge (`server/javaSdkBridge.js`) and Spring Boot integration guide ([`docs/java-sdk-gateway.md`](docs/java-sdk-gateway.md)).
- **Standalone Deployment Bundle Generator:** 1-click generation, preview, copy, and download of container `Dockerfile`, Kubernetes manifest (`deployment.yaml` with ConfigMap, Deployment, Service), `workflow.yaml`, and `README.md`.
- **Real-Time Runtime Log Explorer:** Real-time search filter, severity pills (`All`, `Info`, `Warn`, `Error` with live count badges), auto-scroll, and 1-click clipboard export.
- **Revision History & Visual Diffing:** Full snapshot revision history with Myers LCS line-by-line diffing and 1-click restore.
- **Template Library & Themes:** Categorized patterns catalog, keyboard shortcuts dialog (`?`/`F1`), and multi-theme system (`Light`, `Dark`, `High-Contrast`).
- **VS Code–Parity IDE Ergonomics:** CodeMirror 6 code editor for the Specification view (syntax highlighting, line numbers, code folding, find-in-editor, inline diagnostics with click-to-jump), fuzzy command palette (`Ctrl/Cmd+Shift+P`), Quick Open for tabs & saved workflows (`Ctrl/Cmd+P`), workspace-wide task search (`Ctrl/Cmd+Shift+F`), aggregated Problems panel with click-to-navigate (`Ctrl/Cmd+Shift+M`), drag-resizable side rails (persisted widths), right-click context menus on canvas nodes, pane and document tabs, a live status bar (selection, problems count, cursor Ln/Col, runtime connectivity), and global shortcuts that work in every view (`Ctrl+S`, `Ctrl+Z`, `Ctrl+O`…).
- **Workflow Library Explorer:** VS Code Explorer–style saved-workflows list in the left rail — click to switch, inline rename, delete, dirty indicators for unsaved tabs, drag-to-reorder rows with persisted manual order, and a "reveal active workflow" affordance (auto-scroll + ◎ button).
- **Settings, Breadcrumbs & Canvas Controls:** Settings dialog (`Ctrl/Cmd+,`) centralizing theme, panel visibility, mini-map, gateway URL/token, and export/import of settings profiles as JSON (secrets excluded); live breadcrumbs (`workflow / do / <task>`, resolving into container tasks such as `for.do`, `fork.branches`, `try`/`catch`); drag-to-reorder tab bar; zoom controls (`Ctrl/Cmd+= / - / 0`) with per-workflow viewport persistence.

Full IDE-parity reference (surfaces, shortcuts, persistence keys): [`docs/ide-parity.md`](docs/ide-parity.md).
**AI orchestration:** the palette **AI** group is live — `LLM call` and `AI agent call` compose valid DSL (sub-flow delegation + catalog-backed providers) and scaffold runnable catalog-backed sub-flows; see [`docs/ai-tasks.md`](docs/ai-tasks.md).

---

## Development

```bash
# Install dependencies
npm install

# Start Vite dev server & JavaScript Sandbox API
npm run dev
```

Open the local Vite URL (`http://localhost:5173` or `http://127.0.0.1:4174`). Contributing guidelines, the Git workflow (protected `main` + `develop`/PR flow) and the required checks are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

The Vite development server exposes the Node sandbox at `POST /api/sandbox/javascript`. To run the standalone gateway service:

```bash
npm run runtime:sandbox
# Listens on 127.0.0.1:8091 with /health, /validate, /runs, /runs/:id/events, /audit
```

---

## Production Deployment Bundle

Click **Deploy bundle** in the workspace toolbar to generate:

1. `Dockerfile` based on `openworkflow/runtime:1.0.3`.
2. `deployment.yaml` (Kubernetes `ConfigMap`, `Deployment` with probes, and `Service`).
3. `workflow.yaml` with valid Open Workflow Specification syntax.
4. `README.md` with Docker and `kubectl apply` commands.
5. `ai/*.yaml` for every referenced AI sub-flow (`run.workflow` → `ai` namespace) — copied into the image, mounted as ConfigMap keys, and documented with `WORKFLOW_SUBFLOW_PATH=/app/ai`. See [`docs/ai-tasks.md`](docs/ai-tasks.md).

---

## Verification Commands

```bash
# Run Vitest unit tests (80 tests)
npm test

# Run Playwright E2E browser tests (64 tests, parallel)
npm run test:browser

# Type-check TypeScript
npm run typecheck

# Lint ESLint rules
npm run lint

# Check code formatting with Prettier
npm run format:check

# Production build
npm run build
```

---

## Documentation Index

- [`CHANGELOG.md`](CHANGELOG.md): Notable changes per release (Keep-a-Changelog format).
- [`TODO.md`](TODO.md): Task board, roadmap, and review findings.
- [`DESIGN.md`](DESIGN.md): Design tokens, typography, layout grid, elevation, and component specs.
- [`docs/ide-parity.md`](docs/ide-parity.md): VS Code–parity surfaces, keyboard shortcuts, and persistence keys.
- [`docs/java-sdk-gateway.md`](docs/java-sdk-gateway.md): Spring Boot & Java SDK 7.x daemon bridge setup guide.
- [`docs/runtime-boundary.md`](docs/runtime-boundary.md): Runtime adapter contract, simulation vs. gateway boundary.
- [`docs/runtime-decision.md`](docs/runtime-decision.md): Target runtime selection decision and compatibility matrix.
- [`docs/security-review.md`](docs/security-review.md): Security review covering secrets, sandbox isolation, rate limiting, and auth.
