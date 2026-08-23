# Open Workflow Editor — Tasks & Roadmap

> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` pending.
> This file is the source of truth for task status. Update the board as work progresses (see the final section for conventions).

## Goal

Build a real, production-ready "VS Code for Open Workflow Specifications": a browser-based authoring and simulation environment with visual drag-and-drop canvas authoring, complete task property inspectors, bidirectional YAML/JSON synchronization, deterministic auto-layout, schema validation, multi-workflow lifecycle management, and a hardened separation between authoring, simulation, and remote runtime execution — with the IDE-level ergonomics (code editor, command palette, quick open, problems panel, resizable panels, context menus, live status bar) that make it feel like VS Code.

---

## Open Task Board

All tracked tasks are closed ✓ — see the Archive below. Task 16 was implemented via valid-DSL composition (sub-flow delegation + catalog-backed providers, per `docs/ai-tasks.md`) instead of waiting for native DSL keys; the native types remain a future option.

**Next candidates:** point `aiProviderBridge.js` at a real provider (env `AI_PROVIDER_API_KEY`; the gateway serves `POST /ai/chat` + `POST /ai/agent` with auth/rate-limit/audit — see `docs/ai-tasks.md`); revisit native `llm-call`/`ai-agent-call` task keys if the Open Workflow spec adds them; enable branch protection in GitHub settings (see `CONTRIBUTING.md`).

## Delivered: AI task families (Task 16) — composition design

The palette **AI** group is live (`LLM call` ◈, `AI agent call` ◮). Since Open Workflow 1.0.3 has no native AI task keys, the implementation composes them from the most suitable valid primitives: **sub-flow delegation** (`run.workflow` → `ai` namespace) with a **catalog-backed provider** (`use.catalogs`) and a **runnable script contract** that production runtimes replace with a provider bridge.

| Piece            | What shipped                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Palette entries  | `comingSoon` removed; adding one inserts a delegation task (`run.workflow` → `ai/prompt-llm` / `ai/ai-agent`) and auto-scaffolds the catalog-backed sub-flow in a new tab (post-commit effect so the parent tab keeps the new task). |
| Sub-flow builder | `workflowModel.createAiSubflowDocument` / `addTopLevelAiTask` / `AI_TASK_SPECS`; schema-valid (unit-tested via `parseWorkflow`).                                                                                                     |
| Script contracts | `scriptContract.AI_LLM_SCRIPT` / `AI_AGENT_SCRIPT` — demo-runnable stubs reading `catalogs['ai-providers']` / `catalogs.agents`; `server/aiProviderBridge.js` reference adapter (validation, server-side keys, 64 KiB limits).       |
| Inspector        | `AiTaskCard` — shown for `run` tasks targeting the `ai` namespace; explains the composition + one-click open/scaffold.                                                                                                               |
| Canvas           | AI-delegated nodes: magenta accent, `ai: <subflow>` subtitle, `◈`/`◮` icons (`taskMeta.isAiDelegation`).                                                                                                                             |
| Template         | `ai-orchestration` catalog pattern (capture → LLM → agent → map → emit).                                                                                                                                                             |
| Docs             | `docs/ai-tasks.md` (full design + contracts), README/ide-parity/CHANGELOG updated.                                                                                                                                                   |
| Tests            | 4 new unit tests (sub-flow docs valid, delegation task + graph, AI styling, all templates parse) + 2 E2E (palette scaffold flow, template catalog).                                                                                  |

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
npm test             # Vitest unit tests (76)
npm run test:browser # Playwright E2E tests (63, parallel workers)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format:check # Prettier
npm run build        # Production build
```

### Latest verification (2026-08-23)

- [x] `npm run typecheck` — clean.
- [x] `npm run lint` — clean.
- [x] `npm run format:check` — clean.
- [x] `npm test` — **76 unit tests pass** (13 in `src/ideParity.test.ts`, +4 breadcrumb +2 reorder, +4 Task 16 AI builders, +5 gateway AI endpoints, +2 demo AI delegation).
- [x] `npm run test:browser` — **63 Playwright E2E tests pass** (parallel workers; Task 24 fixes landed).
- [x] `npm run build` — production bundle builds.

---

## Archive — Delivered Tasks

### VS Code parity round 2 (Tasks 10–23)

| #   | Task                                                 | What shipped                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Workflow Library explorer sidebar                    | `LibraryExplorer.tsx` — list, rename, delete, switcher, dirty indicator                                                                                                                                                                           |
| 11  | Drag tabs to reorder the tab bar                     | HTML5 drag with drop-target feedback on `DocumentTabs`                                                                                                                                                                                            |
| 12  | Live breadcrumbs bar                                 | `workflow / do / <task>` chain with clickable task segment                                                                                                                                                                                        |
| 13  | Settings dialog (`Ctrl/Cmd+,`)                       | Theme, panels, mini-map, gateway URL/token                                                                                                                                                                                                        |
| 14  | Minimap toggle & zoom controls w/ persistence        | `Ctrl+= / - / 0`, palette commands, per-workflow viewport restore                                                                                                                                                                                 |
| 15  | Task palette grouped by function + AI group          | Flow control / Data & logic / Services / Events / AI (prototype entries)                                                                                                                                                                          |
| 17  | Accordion sections in left & right panels            | Left: Workflows + Task palette sections (persisted). Right: clickable head toggles                                                                                                                                                                |
| 18  | Palette group accordions + accordion/minimize fix    | Nested group accordions; auto-minimize rail when all sections collapse; scrollable workflow list                                                                                                                                                  |
| 19  | Control audit: dedupe + relocate controls            | One validation indicator, slim banner, spec-bar + canvas-toolbar placement; see docs/ide-parity.md                                                                                                                                                |
| 20  | Drag-to-reorder workflow library rows                | HTML5 drag on `LibraryExplorer` rows; persisted order (`open-workflow-editor:library-order:v1`)                                                                                                                                                   |
| 21  | Deeper breadcrumbs into container tasks              | `getBreadcrumbPath` walks `for.do`, `fork.branches`, `try`/`catch` nesting; clickable task segments                                                                                                                                               |
| 22  | Explorer "reveal active file"                        | Active row auto-scrolls into view on tab switch + "◎" reveal button in the Workflows header                                                                                                                                                       |
| 23  | Settings profiles (export/import JSON)               | `SettingsDialog` export/import; covers theme, mini-map, panels, gateway URL (Bearer token excluded)                                                                                                                                               |
| 24  | E2E parallel flakes root-caused & workers re-enabled | Canvas graph completeness fix (SDK semantic graph omitted mid-chain disconnected tasks); `reuseExistingServer: !CI`; evidence: 61/61 parallel + 183/183 (61×3)                                                                                    |
| 25  | Palette group drag-to-reorder                        | Drag accordion heads (`application/open-workflow-group`); persisted `palette-group-order:v1`; `orderPaletteGroups` helper                                                                                                                         |
| 26  | Per-workflow theme overrides                         | `workflow-themes:v1` override map; Settings "Theme for this workflow" + top-bar override dot; resolved theme = override ?? global                                                                                                                 |
| 27  | Canvas multi-select                                  | Modifier-click additive selection, rubber-band, multi-drag/delete; bulk duplicate/delete context menu; graph-complete canvas                                                                                                                      |
| 28  | Canvas-scoped command-palette UX                     | Zoom/fit/mini-map commands auto-switch to the canvas view on invoke (no more disabled entries)                                                                                                                                                    |
| 29  | Git workflow hardening (repo-side)                   | `CONTRIBUTING.md` with protected-`main` + `develop`/PR flow and required checks; CI already runs on PRs (`pull_request`); note: branch protection itself must be enabled in GitHub repo settings                                                  |
| 31  | TODO.md self-consistency cleanup                     | Stale `## Planned: AI task families (design phase)` heading removed; verification sections refreshed (76 unit / 63 E2E parallel); scheduler comments cleaned                                                                                      |
| 32  | Gateway AI endpoints (`POST /ai/chat`, `/ai/agent`)  | `runtimeGatewayHandler` now serves both through `aiProviderBridge` — same auth/rate-limit/audit envelope as the runtime routes; 503 when unconfigured, 502 on provider errors; 5 unit tests (incl. audit entries)                                 |
| 33  | Demo engine executes AI delegation sub-flows         | `run.workflow` → `ai` namespace runs with contract-shaped results (`llmResult`/`agentResult`, prompt vs goal precedence); delegation outputs merge into context under the task name so `$context.<task>.llmResult` mapping resolves; 2 unit tests |

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
