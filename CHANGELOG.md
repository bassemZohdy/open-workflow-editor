# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Drag-to-reorder workflow library rows with persisted manual order (`open-workflow-editor:library-order:v1`). (Task 20)
- Explorer "reveal active workflow": active row auto-scrolls into view on tab switch plus a "◎" reveal button in the Workflows header. (Task 21)
- Deeper breadcrumbs into container tasks — `workflowModel.getBreadcrumbPath` walks `do`, `for.do`, `fork.branches`, `try`/`catch` nesting with clickable task segments; the root `do` segment always renders. (Task 21)
- Settings profiles: export/import workspace settings as JSON (theme, mini-map, panel widths, rail sections, panel visibility, gateway URL; Bearer tokens deliberately excluded). (Task 23)
- `workflowStore.reorderWorkflowIds` — pure, unit-tested reorder helper reused by the explorer drag handler.
- `CHANGELOG.md` (this file).

### Changed

- Pinned Playwright E2E workers to 1 (`playwright.config.js`) — full-parallel runs on high-core machines flaked across unrelated tests; serial runs are deterministic (57/57). Re-tuning parallelism is tracked as a TODO task.
- README and `docs/ide-parity.md` refreshed to cover Tasks 20–23, the `library-order:v1` persistence key, and current test counts (62 unit / 57 E2E).

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
