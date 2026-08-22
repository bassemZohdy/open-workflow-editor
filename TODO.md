# Open Workflow Editor — Tasks & Roadmap

> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` pending.
> This file is the source of truth for task status. Update the board as work progresses (see the final section for conventions).

## Goal

Build a real, production-ready "VS Code for Open Workflow Specifications": a browser-based authoring and simulation environment with visual drag-and-drop canvas authoring, complete task property inspectors, bidirectional YAML/JSON synchronization, deterministic auto-layout, schema validation, multi-workflow lifecycle management, and a hardened separation between authoring, simulation, and remote runtime execution — with the IDE-level ergonomics (code editor, command palette, quick open, problems panel, resizable panels, context menus, live status bar) that make it feel like VS Code.

---

## Task Status Board — all delivered ✓

| #   | Task                                              | Status        | Notes                                                                                                                      |
| --- | ------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Code editor for Specification view (CodeMirror 6) | `[x]` DONE    | `SpecEditor.tsx` — highlighting, gutter, diagnostics, search, folding                                                      |
| 2   | Command Palette (`Ctrl/Cmd+Shift+P`)              | `[x]` DONE    | `CommandPalette.tsx` — fuzzy search across actions/tasks/workflows/views                                                   |
| 3   | Quick Open (`Ctrl/Cmd+P`)                         | `[x]` DONE    | `QuickOpenDialog.tsx` — open tabs + saved-workflow library                                                                 |
| 4   | Drag-resizable side panels                        | `[x]` DONE    | `ResizeHandle.tsx` — left/right rails, persisted widths                                                                    |
| 5   | Right-click context menus                         | `[x]` DONE    | `ContextMenu.tsx` — canvas nodes, pane, document tabs                                                                      |
| 6   | Problems panel (aggregated diagnostics)           | `[x]` DONE    | `ProblemsPanel.tsx` — docked, click-to-navigate                                                                            |
| 7   | Workspace-wide search (`Ctrl/Cmd+Shift+F`)        | `[x]` DONE    | Same quick-open dialog in search mode                                                                                      |
| 8   | Live status bar                                   | `[x]` DONE    | `StatusBar.tsx` — selection, problems, cursor, engine/gateway state                                                        |
| 9   | Global shortcuts in every view (spec view too)    | `[x]` DONE    | App-level capture-phase key handler + spec-view undo/redo/save                                                             |
| 10  | Workflow Library explorer sidebar                 | `[x]` DONE    | `LibraryExplorer.tsx` — list, rename, delete, switcher, dirty indicator                                                    |
| 11  | Drag tabs to reorder the tab bar                  | `[x]` DONE    | HTML5 drag with drop-target feedback on `DocumentTabs`                                                                     |
| 12  | Live breadcrumbs bar                              | `[x]` DONE    | `workflow / do / <task>` chain with clickable task segment                                                                 |
| 13  | Settings dialog (`Ctrl/Cmd+,`)                    | `[x]` DONE    | `SettingsDialog.tsx` — theme, panels, mini-map, gateway URL/token                                                          |
| 14  | Minimap toggle & zoom controls w/ persistence     | `[x]` DONE    | `Ctrl+= / - / 0`, palette commands, per-workflow viewport restore                                                          |
| 15  | Task palette grouped by function + AI group       | `[x]` DONE    | Flow control / Data & logic / Services / Events / AI (prototype entries)                                                   |
| 16  | AI task families (`llm-call`, `ai-agent-call`)    | `[ ]` PLANNED | Palette placeholder ready; implementation waits on DSL/schema support                                                      |
| 17  | Accordion sections in left & right panels         | `[x]` DONE    | Left: Workflows + Task palette sections (persisted). Right: clickable head toggles                                         |
| 18  | Palette group accordions + accordion/minimize fix | `[x]` DONE    | Nested group accordions; auto-minimize rail when all sections collapse; scrollable workflow list                           |
| 19  | Control audit: dedupe + relocate controls         | `[x]` DONE    | One validation indicator, slim banner, spec-bar + canvas-toolbar placement; see docs/ide-parity.md "Control placement map" |

**Next candidates (not yet scheduled):** drag-and-drop reorder of the workflow library rows; deeper breadcrumbs into container tasks (`for.do`, `fork.branches`, `switch` cases); explorer "reveal active file" (+ follows active tab); per-workspace settings profiles (export/import JSON).

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

## Completed Backlog (delivered in this round)

### Task 10: Workflow Library explorer sidebar

- [x] `LibraryExplorer.tsx` — compact saved-workflows list in the left rail (VS Code Explorer analog), sorted with active row highlighted.
- [x] One-click switch; inline rename (double-click or ✎, Enter/Esc commit/cancel, duplicate-name guard); delete with confirm (except active row, which uses the existing Delete dialog path).
- [x] Dirty indicator for unsaved tabs; unsaved tabs appear as `✎` entries; "+ New" quick button.
- [x] Renaming a non-active workflow updates the record, re-serializes the document name, and updates any open tab.

### Task 11: Drag tabs to reorder the tab bar

- [x] HTML5 drag on tabs (`application/open-workflow-tab`), drag-over highlight, drop reorders `openTabIds`; drag feedback cursor.

### Task 12: Live breadcrumbs bar

- [x] Replaces the static "Dubai Government cases /" prefix with `workflow / do / <task>`; task segment is clickable and appears when a task is selected.

### Task 13: Settings dialog

- [x] `Ctrl/Cmd+,` (and command palette entry) opens a modal with Appearance (theme, mini-map), Panels (task palette / inspector / runtime toggles, reset widths), and Runtime gateway (URL + bearer token).
- [x] Gateway config persists to the same localStorage keys the Runtime console uses and fires `open-workflow:gateway-config-changed`; the Runtime console syncs and switches to gateway mode automatically when a URL is applied.

### Task 14: Mini-map toggle & zoom controls with persistence

- [x] `Ctrl/Cmd+=` / `Ctrl/Cmd+-` / `Ctrl/Cmd+0` (zoom in / out / reset) + command palette entries; mini-map toggle in the palette and Settings.
- [x] Per-workflow viewport (pan/zoom) restored on open and persisted to localStorage (`open-workflow-editor:viewports:v1`); canvas prefs (`showMiniMap`) persisted (`open-workflow-editor:canvas-prefs:v1`).

### Verification (2026-08-22)

- [x] `npm run typecheck` — clean.
- [x] `npm run lint` — clean.
- [x] `npm run format:check` — clean.
- [x] `npm test` — 56 unit tests pass (13 in `src/ideParity.test.ts`).
- [x] `npm run test:browser` — **50 Playwright E2E tests pass** (7 new in `tests/ide-parity.spec.js` covering the library explorer, tab reorder, breadcrumbs, settings dialog, and zoom/minimap).
- [x] `npm run build` — production bundle builds.

---

## Archive — VS Code Parity Tasks 1–9 (completed earlier)

All nine items from the original gap analysis are done; per-task checklists were kept during delivery and are summarized here:

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

## Verification Commands

```bash
npm test            # Vitest unit tests (56)
npm run test:browser# Playwright E2E tests (50)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format:check# Prettier
npm run build       # Production build
```

---

## How to keep this file current

1. When starting a task, add a board row with `[~] IN PROGRESS` **before** coding.
2. Update sub-items as they land.
3. When done: `[x] DONE` + one-line note in the board.
4. Finished tasks move to the Archive/Capabilities sections; new gaps go into the "Next candidates" list.
