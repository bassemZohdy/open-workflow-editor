# IDE Parity — VS Code–like authoring surfaces

The editor ships a set of IDE-level ergonomics so authoring Open Workflow definitions feels like working in VS Code. This document describes each surface, its keyboard access, and where its state is persisted.

Primary implementation: `main.tsx` (wiring & global shortcuts) and the `src/components/layout/` components referenced below.

---

## 1. Code editor (Specification view)

`src/components/layout/SpecEditor.tsx` — CodeMirror 6.

- **Language:** YAML or JSON (format toggle in the spec bar) with syntax highlighting driven by `--cm-*` CSS variables, so all three themes (Light / Dark / High-Contrast) restyle the editor automatically.
- **Editing features:** line numbers and active-line gutter, code folding, bracket matching, Enter auto-indent, find-in-editor (`Ctrl/Cmd+F` inside the editor), selection-match highlighting, tab insertion.
- **Inline diagnostics:** the lint gutter and squiggly underlines show (debounced, 120 ms):
  1. YAML/JSON syntax errors (precise line/column from the parser mark),
  2. SDK schema violations (position resolved from the `instancePath`),
  3. graph issues from `validateGraph` (position resolved from the task path).
     Clicking a Problems-panel entry that carries a line/column selects that position in the editor.
- **Undo/redo:** spec edits join the document-level undo history (`Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`) — CodeMirror's internal history is intentionally not used, so canvas and text edits share one history stack.
- **Automation hook:** the CodeMirror view is exposed as `window.__specEditorView` (used by the Playwright suite).

## 2. Command palette

`src/components/layout/CommandPalette.tsx` — `Ctrl/Cmd+Shift+P`.

- Fuzzy, keyed-by-score search with matched-character highlighting; sections (`File`, `Edit`, `Tasks`, `View`, `Workflow`, `Workflows`, `Settings`, `Help`).
- Includes every toolbar action (`Save`, `Validate`, `Auto layout`, `Format`, `Export`, `Copy`, `Deploy bundle`, `Templates`, `History`, …), view/panel toggles, zoom and mini-map commands, theme switching, `Add <type> task` for all 12 task types, and direct `Open workflow: <name>` entries for the saved library.
- Keyboard: `↑/↓` or `Tab` to navigate, `Enter` to run, `Esc` to dismiss.

## 3. Quick open & workspace search

`src/components/layout/QuickOpenDialog.tsx`.

- **Quick open** (`Ctrl/Cmd+P`): fuzzy switching across open tabs _and_ every record in the saved-workflow library; dirty tabs carry a dot.
- **Workspace search** (`Ctrl/Cmd+Shift+F`): searches task names/types across every saved workflow and open tab, grouped by workflow; selecting a result opens the workflow and filter-highlights the task on the canvas.

## 4. Problems panel

`src/components/layout/ProblemsPanel.tsx` — bottom dock (`Ctrl/Cmd+Shift+M`, or the status-bar count).

- Aggregates SDK schema errors (severity `error`) and graph issues (severity `warning`), grouped by kind with live count badges.
- Click to navigate: graph issue → selects the task node on the canvas; schema error → jumps to the line/column in the spec editor.

## 5. Resizable rails & independent panel collapse

`src/components/layout/ResizeHandle.tsx` — 6 px drag gutters between palette/canvas and canvas/inspector.

- Clamped widths (left 200–420 px, right 260–560 px), pointer-capture drag, double-click resets to design defaults (left 246 px / right 340 px).
- Persisted under `open-workflow-editor:panel-widths:v1`; collapse toggles are independent and still supported.
- **Right rail collapses on its own**: when BOTH of its components (Inspector + Runtime console) are collapsed, the rail narrows to a 52 px icon strip — it no longer requires the left rail to be collapsed first (the old "collapse-all-only" behavior). Each panel can also be collapsed individually into a horizontal icon+label strip.
- Collapsed strips use **icons** (☰ Inspector, ▶ Runtime, ▦ palette) instead of vertical `writing-mode` text, keeping the narrow rails layout-stable.

### Accordion behavior

- **Left rail** contains accordion sections — **Workflows** (library explorer) and **Task palette** (grouped tasks). Their chevron headers (`▸`/`▾`, with item counts and the "+" quick action) toggle each section independently, and the open/collapsed state persists (`open-workflow-editor:rail-sections:v1`).
- **Palette groups** (Flow control, Data & logic, Services, Events, AI) are nested accordions inside the Task palette section — each group folds its task items, state persisted in the same key.
- **Accordion + minimization are consistent**: collapsing the entire left rail's content (both sections) auto-minimizes the rail to its `▦` icon strip (mirroring the right rail, where collapsing both panels narrows it to `☰`/`▶` strips). Reopening from the strip restores a usable rail with both sections open; the whole-rail icon-collapse and the "Focus canvas" mode still work and restoring from them also un-collapses the sections.
- **Workflow list** is extendable independently: it scrolls internally (max-height) inside the Workflows section, keeping the rail body from growing indefinitely.
- **Right rail** panel heads (Inspector title, Runtime summary) are clickable toggles with chevrons; the dedicated collapse buttons remain for keyboard access.

## 6. Context menus

`src/components/layout/ContextMenu.tsx` (right-click):

- **Canvas node:** Select in inspector, Duplicate task (`Ctrl+D`), Copy task YAML, Delete task.
- **Canvas pane:** Fit view (`F`), Auto layout, Copy workflow YAML, Toggle problems panel, Add task… (opens the command palette).
- **Document tab:** Open, Save (when dirty), Close, Close others, Close all.

Dismissed by outside click, `Esc`, or scroll; clamped to the viewport.

## 7. Live status bar

`src/components/layout/StatusBar.tsx` — replaces the old static footer.

- Left: engine state, command-palette affordance (`⌘P`), problems count (click opens the panel).
- Center: workflow name, format (`YAML`/`JSON`), selection (`task: <name>` / `canvas` / `specification`), cursor `Ln / Col` in the spec view, save state.
- Right: runtime connectivity (Built-in engine / Runtime online / Runtime offline) and transient notices.

## 8. Workflow library explorer — the single workflow switcher

`src/components/layout/LibraryExplorer.tsx` — left rail, above the task palette (VS Code Explorer analog).

- The explorer is the **one canonical switcher** for saved workflows; open tabs (top bar) and Quick Open / command-palette entries are _derived_ surfaces, not parallel lists. The former header dropdown was removed to avoid three conflicting workflow lists with inconsistent naming.
- Lists saved workflows (active row highlighted) plus unsaved tabs (marked with ✎ and a dirty dot).
- **Drag-to-reorder rows:** HTML5 drag (`application/open-workflow-library`) with drop-target feedback; the manual order persists in `open-workflow-editor:library-order:v1` via the pure `workflowStore.reorderWorkflowIds` helper.
- **Reveal active workflow:** the active row auto-scrolls into view on tab switch, and the Workflows header offers a "◎" reveal button for manual reveal.
- Click to switch; double-click or ✎ to rename inline (Enter commits, Esc cancels, duplicate names rejected); ✕ deletes (confirm dialog; the active row uses the standard Delete-flow).
- "＋" creates a new workflow; the title row shows a `saved`/`unsaved` chip for the active workflow.

## 9. Tab reordering

`DocumentTabs.tsx` — drag a tab onto another to reorder the tab bar (drop-target highlight, pointer grab cursor). Tab order is preserved in-session only.

## 10. Breadcrumbs

The static `Dubai Government cases /` prefix is replaced by a live chain built by `workflowModel.getBreadcrumbPath`:

- Root chain `workflow-name / do` always renders; selecting a task appends its segment (clickable — selects the node).
- Selections inside containers resolve the full nesting chain — `for.do`, `fork.branches`, and `try`/`catch` — with clickable task segments at each level.

## 11. Settings dialog

`src/components/layout/SettingsDialog.tsx` — `Ctrl/Cmd+,` (or command palette → `Open settings…`).

- **Appearance:** color theme, mini-map toggle.
- **Panels:** task palette rail, inspector rail, runtime console visibility; reset panel widths to defaults.
- **Runtime gateway:** gateway URL and bearer token. They are stored in the same localStorage keys the Runtime console uses and broadcast through `open-workflow:gateway-config-changed`; the console picks them up and switches to gateway mode when a URL is applied.
- **Settings profiles:** export the workspace settings as JSON (theme, mini-map, panel widths, rail sections, panel visibility, gateway URL) and re-import them from file. Bearer tokens are deliberately excluded from exports.

## 12. Zoom & mini-map persistence

- `Ctrl/Cmd+=` zoom in, `Ctrl/Cmd+-` zoom out, `Ctrl/Cmd+0` reset zoom; matching commands in the palette.
- Per-workflow pan/zoom is restored when reopening a workflow and stored in `open-workflow-editor:viewports:v1`; canvas prefs (mini-map visibility) live in `open-workflow-editor:canvas-prefs:v1`.

---

## Global keyboard shortcuts

| Shortcut                                   | Action                                          |
| ------------------------------------------ | ----------------------------------------------- |
| `Ctrl/Cmd+S`                               | Save workflow                                   |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`          | Undo / Redo (canvas **and** specification view) |
| `Ctrl/Cmd+P`                               | Quick open workflow                             |
| `Ctrl/Cmd+Shift+P`                         | Command palette                                 |
| `Ctrl/Cmd+Shift+F`                         | Workspace-wide task search                      |
| `Ctrl/Cmd+Shift+M`                         | Toggle problems panel                           |
| `Ctrl/Cmd+Shift+L`                         | Collapse / expand all panels                    |
| `Ctrl/Cmd+,`                               | Open settings                                   |
| `Ctrl/Cmd+O`                               | Open workflow file                              |
| `Ctrl/Cmd+=` / `Ctrl/Cmd+-` / `Ctrl/Cmd+0` | Zoom in / out / reset (canvas)                  |
| `Ctrl/Cmd+D`                               | Duplicate selected task (canvas)                |
| `F`                                        | Fit canvas view                                 |
| `?` / `F1`                                 | Keyboard shortcuts reference                    |
| `Esc`                                      | Dismiss overlays                                |
| `Delete` / `Backspace`                     | Delete selected task (canvas)                   |
| `Ctrl/Cmd+A`                               | Select all tasks (canvas)                       |

## Persistence keys

| Key                                                         | Contents                      |
| ----------------------------------------------------------- | ----------------------------- |
| `open-workflow-editor:dubai-government:v1`                  | Active workflow spec draft    |
| `open-workflow-editor:library:v4`                           | Saved-workflow library        |
| `open-workflow-editor:positions:v4`                         | Canvas node positions         |
| `open-workflow-editor:preferences:v4`                       | Editor preferences            |
| `open-workflow-editor:panel-widths:v1`                      | Resizable rail widths         |
| `open-workflow-editor:canvas-prefs:v1`                      | Canvas preferences (mini-map) |
| `open-workflow-editor:viewports:v1`                         | Per-workflow pan/zoom         |
| `open-workflow-editor:library-order:v1`                     | Manual workflow-library order |
| `open-workflow-gateway-url` / `open-workflow-gateway-token` | Runtime gateway connection    |
| `open-workflow-theme`                                       | Color theme                   |

---

## Control placement map

Every control lives in exactly one place; the naming/data model behind each is single-sourced.

| Control                                              | Location                                | Notes                                                                          |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Save (library)                                       | Top bar                                 | Single write action; status bar mirrors save state                             |
| Focus canvas / expand panels                         | Top bar                                 | Toggles all rails/focus mode                                                   |
| Templates, History, ⌨ shortcuts, theme               | Top bar                                 | Global dialogs & preferences                                                   |
| Open / Save file, New tab                            | Tab bar                                 | Document lifecycle (file system)                                               |
| Duplicate, Delete, Undo, Redo, Deploy bundle         | Workspace head                          | Document-level operations                                                      |
| Import file, Format, Copy, Export (spec)             | Spec bar                                | Specification-surfaced actions, visible in the Specification view              |
| Auto layout, Manual/Unlock layout                    | Canvas toolbar                          | Graph layout — canvas-scoped                                                   |
| Search tasks, type filter, align, Fit view, SVG, PNG | Canvas toolbar                          | Canvas-scoped                                                                  |
| Mini-map, zoom & viewport                            | Canvas                                  | Persisted per workflow                                                         |
| Validation state (pill)                              | Mode tabs                               | **Single visible indicator**: `Valid/Invalid specification`                    |
| Problems count + open panel                          | Status bar                              | Same data, action affordance (VS Code convention)                              |
| Validation banner                                    | Above workspace                         | Slim one-line summary of the first issue; click → Problems panel (no raw dump) |
| Validate workflow (forced re-check)                  | Command palette only                    | Validation runs live; the action is keyboard-first                             |
| New workflow                                         | Workflows section header + tab bar "＋" | Contextual "+" only; no duplicate rail-header button                           |
| Gateway URL/token                                    | Settings dialog + Runtime console       | Same localStorage keys                                                         |

### Redundancy removals (audit)

- The top-bar **"Validate workflow" button** was removed — validation runs automatically on every change; its LED duplicated the mode-tabs pill and the status-bar count. The action remains in the command palette.
- The **raw `<pre>` validation dump** was replaced with a clickable one-line summary → Problems panel (structured, click-to-navigate).
- The **rail-header "＋"** was removed (duplicate of the Workflows header "+" and the tab bar "+").
- **Import / Format / Copy / Export** moved from the workspace head to the spec bar; **Auto layout / Manual layout** moved from the workspace head to the canvas toolbar — each control now sits with the surface it operates on.

---

## References

- Editor & spec diagnostics: `src/formatters.ts` (`collectSpecDiagnostics`), `src/components/layout/SpecEditor.tsx`
- Fuzzy matching: `src/fuzzy.ts`
- E2E coverage: `tests/ide-parity.spec.js`
