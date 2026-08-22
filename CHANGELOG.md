# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed

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
