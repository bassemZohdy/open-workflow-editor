# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-08-23

The sub-flow lifecycle goes end-to-end: scaffold, diagnose, execute (demo engine), observe and deploy. Suite: **106 unit / 71 E2E (parallel)**.

### Added (Tasks 20–23)

- Drag-to-reorder workflow library rows with persisted manual order (`open-workflow-editor:library-order:v1`). (Task 20)
- Explorer "reveal active workflow": active row auto-scrolls into view on tab switch plus a "◎" reveal button in the Workflows header. (Task 21)
- Deeper breadcrumbs into container tasks — `workflowModel.getBreadcrumbPath` walks `do`, `for.do`, `fork.branches`, `try`/`catch` nesting with clickable task segments; the root `do` segment always renders. (Task 21)
- Settings profiles: export/import workspace settings as JSON (theme, mini-map, panel widths, rail sections, panel visibility, gateway URL; Bearer tokens deliberately excluded). (Task 23)
- `workflowStore.reorderWorkflowIds` — pure, unit-tested reorder helper reused by the explorer drag handler.
- `CHANGELOG.md` (this file).

### Added (Tasks 25–28)

- Task palette **group drag-to-reorder** with persisted order (`open-workflow-editor:palette-group-order:v1`) and an `orderPaletteGroups` helper. (Task 25)
- **Per-workflow theme overrides** with fallback to the global theme (`open-workflow-editor:workflow-themes:v1`); the Settings dialog gained "Theme for this workflow" and the top bar shows an override dot. (Task 26)
- **Canvas multi-select** — modifier-click additive selection (Ctrl/Cmd/Shift), rubber-band selection, and bulk duplicate/delete from a multi-selection context menu. (Task 27)
- Canvas-scoped command-palette entries (zoom, fit, mini-map) now **auto-switch to the canvas view** instead of rendering disabled. (Task 28)

### Added (Task 16 — AI task families, composition-based)

- **Palette AI group is live**: `LLM call` (◈) and `AI agent call` (◮) add a valid `run.workflow` delegation task and auto-scaffold the catalog-backed sub-flow (`ai/prompt-llm`, `ai/ai-agent`) in a new tab. Composition instead of new DSL keys — see `docs/ai-tasks.md`.
- `workflowModel` builders: `AI_TASK_SPECS`, `createAiSubflowDocument`, `addTopLevelAiTask`; catalog-backed provider entries (`ai-providers` / `agents`).
- Runnable contract stubs (`AI_LLM_SCRIPT`, `AI_AGENT_SCRIPT`) + server-side reference bridge `server/aiProviderBridge.js` (validation, server-only keys, 64 KiB limits).
- `AiTaskCard` inspector card, magenta AI node styling (`ai: <subflow>`), `ai-orchestration` catalog template.
- **Gateway AI endpoints** (`POST /ai/chat`, `POST /ai/agent`) on the runtime gateway — provider bridge with the same auth/rate-limit/audit envelope; `503` unconfigured / `502` provider error / `400` invalid payload. (Task 32)
- **Demo engine executes AI delegation sub-flows** (`run.workflow` → `ai` namespace): contract-shaped results (`llmResult`/`agentResult`, prompt/goal precedence) and delegation outputs merged into context under the task name, so parent mapping steps resolve end-to-end. (Task 33)
- Tests: suite now **76 unit / 63 E2E (parallel)**.

### Added

- **Runtime panel shows the final run output:** after a terminal run, a "Run output" section renders the produced run context as pretty JSON (key count + scrollable block) — previously the panel displayed timeline, failures and logs but never the values a workflow actually produced. (Task 49)

### Fixed

- **Gateway ↔ real provider-bridge integration is tested end-to-end:** the gateway AI tests injected a fake bridge, while the real `createAiProviderBridge` was only unit-tested in isolation. New tests wire the real bridge through `aiProviderConfig` with a stubbed fetch — `/ai/chat` → bridge → provider (Bearer auth, contract mapping, audit entry) and provider failures mapped to `502`; plus the unconfigured-key `503` path through the real bridge. (Task 54)
- **AI provider bridge is now directly tested:** `createAiProviderBridge` — the gateway's provider dependency — had no direct tests (it was only covered indirectly through injected bridges). A mock-fetch suite now covers: key-required configuration errors, Bearer/auth + URL normalization on chat calls, contract mapping (`completion`/`model`/`usage`, agent `steps`/`outcome`), payload validation (required/unknown/64 KiB limits), and provider-failure mapping into `AI provider error (<status>)`. (Task 53)
- **Sub-flow open/scaffold is namespace-aware:** `handleOpenSubflow` matched tabs and saved library entries by NAME only, so two sub-flows with the same name in different namespaces collided — scaffolding/opening could switch to (or open) the wrong document. Matching now compares `namespace`+`name` whenever the caller supplies a namespace (with a name-only fallback for legacy documents without one); distinct same-named sub-flows scaffold as separate tabs. (Task 52)
- **AI palette adds reuse an existing matching sub-flow instead of scaffolding duplicates:** the post-commit scaffold baked its own `createWorkflowId`/open logic, so adding the same AI task twice created a fresh `prompt-llm`/`ai-agent` tab every time. It now delegates to `handleOpenSubflow` — switch to an existing tab, open a saved entry, or scaffold exactly once; the parent still keeps every added delegation task. (Task 51)
- **README AI-orchestration paragraph updated:** it stopped at palette + scaffold; now it also covers demo-engine execution of referenced sub-flow documents (with contract-shaped mock fallback), Problems-panel diagnostics with one-click scaffold, and the deployment bundle's `subflows/<namespace>/<name>.yaml` artifacts. Also dropped the leftover `showDeploymentBundle` dependency from the `workspaceDocuments` memo (the gate was removed in Task 38). (Task 50)
- **Docs parity (`docs/ide-parity.md`):** the Problems-panel section now documents the **Sub-flow references** group, per-warning **Scaffold** quick action, workspace-wide reference detection, and click-to-select-and-highlight navigation; the breadcrumbs section notes the canvas highlight on selection. These surfaces shipped across Tasks 39/43/47 but the reference doc had not been refreshed. (Task 48)
- **Selecting a task from outside the canvas highlights it there:** problems-panel items and breadcrumb clicks set `selectedId` (which opened the Inspector) but never marked the node `selected`, so the canvas showed no highlight. New `selectTaskOnCanvas` helper (sets view, selection, and the node's `selected` flag — mirroring a direct canvas click) is used by the problems panel (graph + sub-flow groups) and breadcrumbs. (Task 47)
- **ai-orchestration template orchestration is covered end-to-end:** the flagship AI pattern was only asserted structurally — now 2 unit tests run it through the demo engine (mocked delegations, and executed AI sub-flow documents with sandbox-script results) asserting `llmSummary`/`agentOutcome` map through, plus the template E2E performs a real demo run and checks the delegation log lines. (Task 46)
- **Runtime task timeline annotates sub-flow steps with their scope:** executed sub-flow steps (`<task>/subflow/<name>/<step>`) now display their scoped path in the timeline row instead of a bare name — plain names like `captureResult` can repeat across sub-flows. (Task 45)
- **Deployment bundle dialog previews shipped sub-flow files individually:** each `subflows/<namespace>/<name>.yaml` artifact now gets its own tab next to the main files, with per-file copy/download (download names sanitize `/` → `_`); previously artifacts were only visible embedded in the ConfigMap/Dockerfile/README tabs. (Task 44)
- **Unresolved sub-flow warnings offer one-click Scaffold:** the warning's message says "Open or scaffold it before deploying", but its item only selected the task. `GraphIssue` gained `subflowTarget`, and Problems-panel items support an optional quick `action` — sub-flow warnings now render a **Scaffold** button that opens/sub-flow scaffolds the exact target; scaffolding resolves the warning live. (Task 43)
- **Problems panel groups sub-flow warnings under their own label:** Task 39 items grouped by `kind`, but the group-label fallback mapped anything that is not `schema`/`graph` to "Task" — unresolved sub-flow warnings rendered under a misleading header. Now a dedicated **"Sub-flow references"** group (`⇄` icon); the Task 39 E2E asserts the label. (Task 42)
- **Deployment bundle manifests are structurally valid (and now tested so):** YAML-parsed verification of the generated ConfigMap/Deployment/Service (Key↔`items`↔`subPath` consistency, env wiring, exactly one doc per kind, schema-valid shipped sub-flow YAMLs) immediately caught a real defect — the volume-mount block joined the `resources:` line onto the last `subPath` value (`...yaml          resources:`), producing an unparsable manifest whenever sub-flows were present. Only substring assertions had covered these outputs before. (Task 41)
- **Demo engine script parity — task outputs under task names:** sandbox `run.script` results are now the task's output and land under the task name in context (like `run.workflow`), so `$context.<scriptTask>.field` resolves — without this, executing the canonical AI sub-flow documents produced `undefined` for the `captureResult` mapping (`$context.invokeLlm.completion`), silently breaking AI delegation runs once the scaffolded tab existed in the workspace (Task 38 regression; caught by the Task 40 TDD pair). The flat context merge is kept for back-compat. (Task 40)
- **Problems panel flags unresolved sub-flow references:** `run.workflow` targets with neither a workspace document (open tab / saved library) nor a canonical AI contract now surface as warnings in the Problems panel (new `subflow` group) — clicking one selects the delegating task in its Inspector. `workflowModel.collectSubflowReferences` (shared with the deployment bundle) walks all task containers and dedupes; `detectMissingSubflowReferences` exempts provided documents and canonical AI names. Previously a dangling reference was silently accepted until deployment. (Task 39)
- **Demo engine executes referenced sub-flow documents:** `run.workflow` delegations matched a workspace document (open tabs + saved library, by `namespace`+`name`, snapshotted at run start via getter so live edits never disturb in-flight runs) now execute the document's task list recursively — child context seeded with the parent state so the delegation result carries the sub-flow's keys and mapping steps (`$context.<task>.field`) resolve; logs and task progress stream into the same run under a scoped path with a nesting depth guard. Without a matching document the AI contract mocks are unchanged. (Task 38)
- **Deployment bundle ships every referenced sub-flow, not just canonical AI ones:** `findSubflowDelegations` (replaces `findAiDelegations`) collects ALL `run.workflow` targets across nested `for`/`fork`/`try`/`catch` containers, materializing each from the workspace (open tabs + saved library records match by `namespace`+`name` — your edited sub-flow wins, including AI ones) with a canonical AI-contract fallback and an "Unresolved sub-flow references" README note for anything missing. Layout unified to `subflows/<namespace>/<name>.yaml` (was `ai/<name>.yaml`; migrated since nothing consumed it yet). (Task 37)
- **Deployment bundle ships referenced AI sub-flows:** previously a deployed AI workflow referenced sub-flows the bundle never shipped — Dockerfile `COPY subflows/` + `WORKFLOW_SUBFLOW_PATH=/app/subflows`, ConfigMap keys with `items`/`subPath` mounts, README section. (Task 35)
- **Duplicate Workflows-sidebar row for the active unsaved tab:** after creating a blank workflow, editing it, then switching away and back, the explorer rendered the same workflow twice with React key collisions (`Encountered two children with the same key`). `libraryRows` in `main.tsx` is now the pure, unit-tested `workflowStore.buildLibraryRows` — rows are folded into a `Map` keyed by id (saved records win over stashed tab snapshots, which win over the active-tab fallback) so every id renders exactly once. (Task 34)
- Tests: suite now **106 unit / 71 E2E (parallel)**.

- **Canvas graph completeness (root cause of the Task 24/27 divergence):** the SDK semantic graph silently omitted top-level tasks that stand disconnected mid-list, so duplicated/de-then'ed tasks existed in the document but never rendered on the canvas. `createFlowGraph` now appends any missing top-level document tasks, and `duplicateTopLevelTask` appends copies at the end of the `do` list (same as palette adds). Unit-tested. (Tasks 24/27)
- `reuseExistingServer: !process.env.CI` — CI always boots a fresh dev server, avoiding stale-server contamination in parallel runs.

### Changed

- Removed the Playwright **serial-workers stopgap**: parallel runs are green again (61 tests × full parallel, plus a 3× repeat run) after the fixes above.
- README, `docs/ide-parity.md`, new `CONTRIBUTING.md` and this changelog refreshed; test counts now **65 unit / 61 E2E**.

### CI

- Added `workflow_dispatch` trigger for manual runs.
- Uploads the production `dist/` bundle as a build artifact.

## 0.1.0 — 2026-08-22

### Added

- Browser-based visual authoring and simulation environment for the Open Workflow Specification 1.0.3 (`@openworkflowspec/sdk` parsing/validation/graph, `@xyflow/react` canvas, ELK.js layout).
- 12 complete task templates with drag-drop authoring, auto-layout, alignment tools, search/filter, SVG/PNG export.
- Hierarchical container sub-graphs (`do`, `for`, `fork`, `try`/`catch`, `switch`) with nested pills.
- Multi-document tabs, Web File System Access sync, revision history with Myers LCS diffing.
- Deep property inspectors for all task types, expression autocomplete, `use.functions` reusable functions, subflow cross-referencing & scaffolding.
- Runtime simulation & gateway integration (demo engine, Node `vm` sandbox, live node status, health card, Bearer auth, rate limiting, audit, SSE), runtime log explorer.
- Java SDK 7.x bridge reference (`server/javaSdkBridge.js`), deployment bundle generator (Dockerfile, K8s manifests).
- Template catalog, Light/Dark/High-Contrast themes, keyboard shortcuts dialog.
- VS Code-parity IDE ergonomics (Tasks 1–19): CodeMirror 6 spec editor, command palette, quick open, workspace search, problems panel, resizable rails, context menus, status bar, global shortcuts, workflow library explorer, tab reordering, breadcrumbs, settings dialog, zoom/mini-map persistence, grouped task palette with AI placeholders, control placement audit.

### CI

- GitHub Actions workflow: lint, format, typecheck, unit, build (Node 22, actions v7) plus a Playwright browser-test job with failure artifacts.
