# Open Workflow Editor — Tasks & Roadmap

> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` pending.
> This file is the source of truth for task status. Update the board as work progresses (see the final section for conventions).

## Goal

Build a real, production-ready "VS Code for Open Workflow Specifications": a browser-based authoring and simulation environment with visual drag-and-drop canvas authoring, complete task property inspectors, bidirectional YAML/JSON synchronization, deterministic auto-layout, schema validation, multi-workflow lifecycle management, and a hardened separation between authoring, simulation, and remote runtime execution — with the IDE-level ergonomics (code editor, command palette, quick open, problems panel, resizable panels, context menus, live status bar) that make it feel like VS Code.

---

## Open Task Board

| #   | Task                                                        | Status        | Notes                                                                                                                                         |
| --- | ----------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | AI task families (`llm-call`, `ai-agent-call`)              | `[ ]` PLANNED | Palette placeholder ready; implementation waits on DSL/schema support (see design section below)                                              |
| 24  | Root-cause E2E parallel flakes & re-enable parallel workers | `[ ]` PENDING | Full-parallel runs on high-core machines flaked (3 different tests across 2 runs); workers pinned to 1 in `playwright.config.js` as a stopgap |
| 25  | Palette drag-to-reorder                                     | `[ ]` PENDING | Mirror the library-row drag pattern (`application/open-workflow-*`) for task palette groups                                                   |
| 26  | Per-workflow theme overrides                                | `[ ]` PENDING | Currently theme is global (`open-workflow-theme`); add per-document override with fallback                                                    |
| 27  | Canvas multi-select                                         | `[ ]` PENDING | Shift/Ctrl+click and rubber-band selection; bulk move/delete/duplicate                                                                        |
| 28  | Command-palette UX review for canvas-scoped commands        | `[ ]` PENDING | Zoom / fit / mini-map entries render disabled in Specification view — confirm intent or auto-switch to canvas on invoke                       |
| 29  | Git workflow hardening                                      | `[ ]` PENDING | Add protected `develop` branch + PR flow per project conventions (repo currently pushes straight to `main`)                                   |

**Scheduling note:** items 24–28 were surfaced by the Playwright review on 2026-08-22. Item 24's stopgap (serial workers) is already merged; the task tracks the real fix.

---

## Planned: AI task families (design phase)

The task palette now shows an **AI** group with `llm-call` and `ai-agent-call` marked _coming soon_ (not draggable, disabled in the command palette, guarded in `addPaletteTask`). Neither exists in Open Workflow 1.0.3 yet — implementation waits for the DSL/schema to accept the task keys. Recommended surface, following the existing editor architecture (`use.functions` + `call` pattern, `run.workflow` decomposition):

| Piece                                 | Recommendation                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LlmCallTaskEditor.tsx` inspector     | Provider + model selectors, multi-line prompt template with `${…}` expression autocomplete, parameters (temperature / max tokens / top-p), context binding (input, context, catalogs → prompt variables), response mapping (model output → task `output`), timeout & retry (reuse `try`/`catch` pattern), "Test prompt" button → server-side provider bridge |
| `AiAgentCallTaskEditor.tsx` inspector | Agent name from a document-level `use.agents` manager, goal/instructions, tool allowlist, memory scope, delegation model (recursive `run.workflow` pattern), limits/timeouts, response mapping                                                                                                                                                               |
| `use.agents` document manager         | Mirror `use.functions` / `use.catalogs` in the Inspector default view (doc-settings)                                                                                                                                                                                                                                                                         |
| Canvas styling                        | Magenta accents for AI nodes, subtitles (`llm: <model>` / `agent: <name>`), mini-map color entry                                                                                                                                                                                                                                                             |
| Template catalog                      | `ai-orchestration` pattern (LLM call → tool/agent branch → output mapping)                                                                                                                                                                                                                                                                                   |
| Security                              | Provider keys live server-side (`server/aiProviderBridge.js`); the browser sends only prompt + selected model; audit + rate limiting mirror the gateway contract                                                                                                                                                                                             |
| Enabling flag                         | Flip `comingSoon: false` in `src/taskMeta.ts` + add `TASK_TEMPLATES` + inspector + node styling once the schema accepts the keys                                                                                                                                                                                                                             |

---

## Review findings — 2026-08-22 Playwright pass

Findings from the full-app browser review (all against a clean dev server):

- **E2E parallelism flakes (→ Task 24):** `npm run test:browser` at default worker count failed 1 test on run 1 and 3 different tests on run 2; every failing test passed in isolation and the full suite passes 57/57 with `--workers=1`. Stopgap: pinned `workers: 1` in `playwright.config.js`.
- **CHANGELOG.md missing:** required by the project workflow; created in the same round (Keep-a-Changelog format, seeded from git history).
- **Docs drift:** README test counts (56/50 → 62/57) and capability list lacked Tasks 20–23; `docs/ide-parity.md` lacked the library drag-reorder/reveal, deep breadcrumbs, settings-profiles sections and the `library-order:v1` persistence key. All updated in the same round.
- **CI gaps:** no manual trigger (`workflow_dispatch`) and no build artifact upload; both added in the same round.
- **Non-issues (checked, no action):** `Escape` in Specification view keeps the view mounted (an earlier suspected repro was a Vite HMR artifact during concurrent editing); console clean of errors/warnings across all reviewed surfaces; Tasks 20–23 verified live (draggable library rows, `workflow / do` breadcrumb, ◎ reveal button, settings profiles export/import).

---

## Verification Commands

```bash
npm test             # Vitest unit tests (62)
npm run test:browser # Playwright E2E tests (57, serial workers)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format:check # Prettier
npm run build        # Production build
```

### Latest verification (2026-08-22)

- [x] `npm run typecheck` — clean.
- [x] `npm run lint` — clean.
- [x] `npm run format:check` — clean.
- [x] `npm test` — **62 unit tests pass** (13 in `src/ideParity.test.ts`, +4 breadcrumb +2 reorder).
- [x] `npm run test:browser` — **57 Playwright E2E tests pass** (serial; see Task 24 for the parallel-flake stopgap).
- [x] `npm run build` — production bundle builds.

---

## Archive — Delivered Tasks

### VS Code parity round 2 (Tasks 10–23)

| #   | Task                                              | What shipped                                                                                        |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 10  | Workflow Library explorer sidebar                 | `LibraryExplorer.tsx` — list, rename, delete, switcher, dirty indicator                             |
| 11  | Drag tabs to reorder the tab bar                  | HTML5 drag with drop-target feedback on `DocumentTabs`                                              |
| 12  | Live breadcrumbs bar                              | `workflow / do / <task>` chain with clickable task segment                                          |
| 13  | Settings dialog (`Ctrl/Cmd+,`)                    | Theme, panels, mini-map, gateway URL/token                                                          |
| 14  | Minimap toggle & zoom controls w/ persistence     | `Ctrl+= / - / 0`, palette commands, per-workflow viewport restore                                   |
| 15  | Task palette grouped by function + AI group       | Flow control / Data & logic / Services / Events / AI (prototype entries)                            |
| 17  | Accordion sections in left & right panels         | Left: Workflows + Task palette sections (persisted). Right: clickable head toggles                  |
| 18  | Palette group accordions + accordion/minimize fix | Nested group accordions; auto-minimize rail when all sections collapse; scrollable workflow list    |
| 19  | Control audit: dedupe + relocate controls         | One validation indicator, slim banner, spec-bar + canvas-toolbar placement; see docs/ide-parity.md  |
| 20  | Drag-to-reorder workflow library rows             | HTML5 drag on `LibraryExplorer` rows; persisted order (`open-workflow-editor:library-order:v1`)     |
| 21  | Deeper breadcrumbs into container tasks           | `getBreadcrumbPath` walks `for.do`, `fork.branches`, `try`/`catch` nesting; clickable task segments |
| 22  | Explorer "reveal active file"                     | Active row auto-scrolls into view on tab switch + "◎" reveal button in the Workflows header         |
| 23  | Settings profiles (export/import JSON)            | `SettingsDialog` export/import; covers theme, mini-map, panels, gateway URL (Bearer token excluded) |

### VS Code parity round 1 (Tasks 1–9)

| Task                | What shipped                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Code editor      | CodeMirror 6: YAML/JSON highlighting (`--cm-*` theme variables), line numbers, active line, folding, bracket matching, find-in-editor, inline diagnostics (js-yaml marks → schema `instancePath` → graph issues) via `lintGutter` + `setDiagnostics`; spec edits join document undo/redo; `window.__specEditorView` exposed for E2E. |
| 2. Command palette  | Fuzzy overlay (~80 commands incl. `Add <type> task` ×12 and `Open workflow: <name>`), sections, matched-char highlighting, keyboard-only nav.                                                                                                                                                                                        |
| 3. Quick open       | Fuzzy switch across open tabs _and_ the saved-workflow library with dirty indicators.                                                                                                                                                                                                                                                |
| 4. Resizable rails  | 6px drag handles, clamped widths, persisted (`panel-widths:v1`), double-click reset.                                                                                                                                                                                                                                                 |
| 5. Context menus    | Canvas nodes (inspect / duplicate / copy YAML / delete), pane (fit / layout / copy / problems / add task), tabs (open / save / close / close others / close all).                                                                                                                                                                    |
| 6. Problems panel   | Bottom dock (`Ctrl+Shift+M`), grouped by kind with severity badges; graph issues select the node, schema errors jump to line/column.                                                                                                                                                                                                 |
| 7. Workspace search | `Ctrl+Shift+F` across every saved workflow + open tabs; opens and filter-highlights the task on canvas.                                                                                                                                                                                                                              |
| 8. Status bar       | Selection, problems count (click to open), Ln/Col, format, save state, engine/gateway connectivity, notices.                                                                                                                                                                                                                         |
| 9. Global shortcuts | Capture-phase layer: `Ctrl+S/Z/Shift+Z/P/Shift+P/Shift+F/O/Shift+M/Shift+L/Shift+M/,/=/-/0`, `Esc` dismiss, `?`/`F1`.                                                                                                                                                                                                                |

## Core Capabilities Already Delivered

- [x] Architecture & modularization (TS, strict mode, lazy ELK.js, vendor chunking).
- [x] Visual authoring & layout (12 task templates, drag-drop, ELK layout, alignment, SVG/PNG export).
- [x] Hierarchical container sub-graphs (nested pills, normalized `try-catch`/`catch` icons).
- [x] Multi-document tabs & Web File System Access sync.
- [x] Deep property inspectors for all task types + expression autocomplete + SDK validation.
- [x] Reusable functions (`use.functions`, dual-mode call inspector, reference validation).
- [x] Document settings & resources view.
- [x] Subflow cross-referencing & scaffolding.
- [x] Runtime simulation & gateway integration (demo engine, Node `vm` sandbox, live node status, health card, Bearer auth, rate limiting, audit, SSE).
- [x] Real-time runtime log explorer (severity pills, auto-scroll, export).
- [x] Java SDK 7.x bridge reference (`server/javaSdkBridge.js`, `docs/java-sdk-gateway.md`).
- [x] Deployment bundle generator (Dockerfile, K8s manifests, README).
- [x] Revision history & Myers LCS diffing with 1-click restore.
- [x] Template catalog, Light/Dark/High-Contrast themes, shortcuts dialog.

---

## How to keep this file current

1. When starting a task, add a board row with `[~]` IN PROGRESS **before** coding.
2. Update sub-items as they land.
3. When done: `[x]` DONE + one-line note in the board.
4. Finished tasks move to the Archive/Capabilities sections; new gaps go into the Open Task Board.
