---
version: alpha
name: Open Workflow Editor
description: A calm workflow instrument panel for composing, inspecting, and safely simulating Open Workflow definitions.
colors:
  primary: '#376FE1'
  ink: '#182231'
  muted: '#7D8796'
  canvas: '#F9FBFD'
  surface: '#FFFFFF'
  shell: '#F4F6F9'
  line: '#DFE4EB'
  success: '#31A47C'
  warning: '#E5A13A'
  danger: '#D47759'
typography:
  sans:
    fontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif'
  mono:
    fontFamily: 'DM Mono, ui-monospace, monospace'
rounded:
  DEFAULT: '0.5rem'
  sm: '0.25rem'
  md: '0.5rem'
  lg: '0.75rem'
spacing:
  rail: '1rem'
  workspace: '1.75rem'
  control: '0.5rem'
  section: '1rem'
components:
  button:
    height: '31px'
    rounded: '0.375rem'
  input:
    height: '33px'
    rounded: '0.375rem'
  runtime-rail:
    width: '340px'
  workflow-node:
    width: '208px'
---

# Open Workflow Editor Design System

## Overview

### Creative North Star

The editor is a workflow instrument panel: a quiet technical workbench where the definition is the source artifact, the canvas is the map, and the right rail is the diagnostic console. The interface should feel dependable during careful configuration and immediate during a local simulation.

### Product context and register

- **Audience and primary job:** Engineers and technical operators author Open Workflow definitions, inspect task properties, validate the graph, and run a safe local simulation.
- **Target market(s) and evidence:** General international developer tooling; the repository and Open Workflow Specification documentation are the current product evidence.
- **Locale(s) and language policy:** English UI and technical identifiers for this milestone; use sentence case and preserve DSL names exactly.
- **Usage scene:** Laptop or large monitor, usually in a bright office, with the canvas and diagnostic controls visible together during active editing.
- **Register:** Product/tool. Familiarity, readable density, and operational clarity lead over decorative expression.
- **Memorable signature:** The right-side operations rail keeps Inspector and Runtime visible as one diagnostic surface beside the workflow artifact.
- **Restraint:** The canvas remains light and quiet; color is reserved for task identity, validation, selection, and runtime state.
- **Anti-references:** Avoid generic SaaS dashboard card grids, dark IDE chrome, glassmorphism, decorative gradients, and tiny low-contrast labels that make the graph feel like a miniature.
- **Token ownership/runtime mapping:** Existing CSS variables in `src/styles.css` remain the runtime source for the current palette. This file mirrors the accepted semantic roles; changes to durable values must update both this file and the shared stylesheet tokens in the same changeset.

## Colors & Themes

The product supports three accessibility themes:

1. **Light:** Cool-neutral shell with `#376FE1` primary, `#FFFFFF` working surfaces, `#DFE4EB` structural lines, and categorical task accents.
2. **Dark:** Deep slate background (`#0D1117`), `#161B22` working surfaces (`#21262D` soft surface), and high-contrast readable text.
3. **High-Contrast:** Pure black background (`#000000`), `#FFFFFF` text, and bold 2px borders for WCAG AAA visibility.

## Code Editor Theming

The Specification view uses CodeMirror 6 with a dedicated set of editor tokens (`--cm-keyword`, `--cm-property`, `--cm-string`, `--cm-literal`, `--cm-comment`, `--cm-punct`, `--cm-gutter-bg`, `--cm-active-line`, `--cm-selection`) that are defined alongside the palette in each of the three theme blocks in `src/styles.css`, keeping syntax highlighting consistent with the surrounding chrome.

## Typography

DM Sans carries interface copy, labels, and task names. DM Mono is reserved for specifications, run identifiers, and logs where technical alignment matters. Body copy stays compact but readable; labels do not rely on uppercase tracking for hierarchy. Long workflow names wrap or truncate only when the complete value remains available in the input or picker.

## Layout

Desktop uses persistent regions:

1. **Top Navigation Bar:** Brand mark, save state + Save action, panel focus-mode toggle, template catalog trigger, revision history trigger, shortcuts trigger (`?`/`F1`), theme selector, and workspace avatar. (Workflow validation is _not_ a button here — it runs live and surfaces in the mode-tabs pill, status bar and Problems panel; the re-check action lives in the command palette.)
2. **Task Palette (Left Rail):** Workflow Library explorer (VS Code Explorer analog and the single workflow-switcher surface — open, inline rename, delete, dirty indicators) above accessible draggable task primitives with quick-add actions. One contextual "+" per surface (Workflows header, tab bar) — no duplicate rail-header "+".
3. **Multi-Document Tabs Bar:** Above the central workspace, presenting open documents, dirty state indicators, quick-close, drag-to-reorder, and local file open/save actions.
4. **Central Workspace:** Live breadcrumbs (`workflow / do / <task>`) above the workflow title; canvas/specification mode tabs with the single validation pill; document-level actions (Duplicate, Delete, Undo, Redo, Deploy bundle) in the header. The canvas carries its own toolbar (search, filter, align, fit, SVG/PNG, Auto/Manual layout) plus mini-map and zoom controls; the Specification view carries its own bar (file name, YAML/JSON toggle, Import file, Format, Copy, Export).
5. **Operations Rail (Right Rail):** Independent collapsible panels for Task Property Inspector and Runtime Console.
6. **Bottom Dock:** Live status bar (selection, problems count, cursor position, format, save state, runtime connectivity) and the collapsible Problems panel.

Side-rail widths are user-resizable: 6 px drag gutters between the rails and the workspace feed `--left-rail-width` / `--right-rail-width` CSS variables (defaults 246 px / 340 px), with collapse toggles preserved.

## Modal Dialogs

Modal overlays share consistent styling:

- **Workflow Template Catalog (`TemplateLibraryDialog`):** Search, category filtering, tag badges, and 1-click instantiate.
- **Revision History & Diffing (`RevisionHistoryDialog`):** Snapshot timeline, line-by-line Myers LCS visual diff viewer, and 1-click restore.
- **Deployment Bundle (`DeploymentBundleDialog`):** Multi-file code viewer (Dockerfile, Kubernetes manifests, `workflow.yaml`, `README.md`) with copy and download actions.
- **Keyboard Shortcuts (`ShortcutsDialog`):** Categorized hotkey quick-reference sheet (`?` / `F1`).
- **Settings (`SettingsDialog`, `Ctrl/Cmd+,`):** Appearance (theme, mini-map), panel visibility, panel-width reset, and runtime gateway URL/bearer token.
- **Command Palette (`CommandPalette`, `Ctrl/Cmd+Shift+P`) & Quick Open (`QuickOpenDialog`, `Ctrl/Cmd+P`):** Fuzzy, keyboard-first overlays for actions, workflow switching, and workspace-wide task search.

See [`docs/ide-parity.md`](docs/ide-parity.md) for the full surface and shortcut inventory.

## Components

### Foundational visual states

Every button, tab, input, node, and drop target has default, hover, focus-visible, active/selected, disabled, and error behavior where applicable. Runtime uses explicit DEMO and GATEWAY labels; mocked execution never uses production-success language without the DEMO context.

### Task Nodes & Container Visualization

Nodes are compact rectangular units with categorical accents and icons. Nested container tasks (`do`, `for`, `fork`, `try`/`catch`, `switch`) display sub-item pills for internal tasks and branches. `try`/`catch` nodes render a dedicated `⊙` icon and indigo palette.

### Task Palette Groups & Rail Accordions

The left rail contains accordion sections — **Workflows** (library explorer) and **Task palette** — each with a chevron header and item count; open/collapsed state persists per user. The task palette is grouped functionally: **Flow control** (`do`, `switch`, `for`, `fork`, `try`), **Data & logic** (`set`, `run`), **Services** (`call`, `wait`), **Events** (`emit`, `listen`, `raise`) — plus a prototype **AI** group (`llm-call`, `ai-agent-call`, magenta accent) whose entries are marked _coming soon_ and are not draggable or addable until the DSL/schema supports them. The right rail's Inspector and Runtime heads are clickable accordion toggles with chevrons.

### Buttons and actions

Primary is reserved for the next safe action (`Start run`, `Save`). Secondary is outlined for utilities. Destructive actions use the danger color and remain separated from routine actions. Important actions retain stable dimensions while busy.

## Do's and Don'ts

- **Do:** Keep the workflow artifact and its diagnostic controls visible in the same desktop view.
- **Do:** Use the same semantic action, state, and focus treatment across canvas, Inspector, Specification, and Runtime.
- **Don't:** Put runtime controls below a tall canvas where they change the canvas footprint or become difficult to discover.
- **Don't:** Use tiny muted text, decorative card repetition, or color-only state cues to carry operational meaning.
