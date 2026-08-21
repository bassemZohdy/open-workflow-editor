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

## Colors

The product uses a restrained cool-neutral shell: `primary` blue for safe actions and focus, `ink` for orientation, `muted` for secondary copy, `surface` for working panels, `canvas` for the graph field, and `line` for structure. `success`, `warning`, and `danger` are semantic state colors, not decoration. Task colors are categorical accents and must keep a readable text/icon counterpart.

## Typography

DM Sans carries interface copy, labels, and task names. DM Mono is reserved for specifications, run identifiers, and logs where technical alignment matters. Body copy stays compact but readable; labels do not rely on uppercase tracking for hierarchy. Long workflow names wrap or truncate only when the complete value remains available in the input or picker.

## Layout

Desktop uses three persistent regions: task palette, central workspace, and operations rail. The workspace owns the canvas/specification viewport; the operations rail owns Inspector and Runtime scroll surfaces. Controls wrap within their own header row rather than clipping or pushing the canvas. At narrow widths, the palette and operations rail collapse into document-flow sections so no critical action is hidden behind an overlay.

Side rails follow IDE conventions: the task palette can collapse to a labeled strip, Inspector and Runtime can collapse independently, and Focus Canvas collapses all side content while keeping explicit expand controls visible. The editor grid stretches its single row so the graph renderer always retains a measurable surface during these transitions.

The spacing rhythm is intentionally compact: 8px control gaps, 16px rail sections, and 28px workspace breathing room. The graph uses fit-to-content after measured mount and keeps task nodes large enough to scan without collision. Runtime status, progress, and logs remain in the side rail rather than expanding the canvas vertically.

## Elevation & Depth

Hierarchy comes from white surfaces, one-pixel structural borders, and short low-blur shadows only where a surface needs separation. The canvas is a recessed field; the operations rail is a stable reading surface. Avoid stacking shadows on every nested panel and never use blur as the primary hierarchy cue.

## Shapes

Controls and panels use 4–12px radii from the token set. Nodes are compact rectangular work units with a categorical accent and icon container. Focus is a solid blue outline with offset; selection is communicated by border and state styling, not color alone.

## Components

### Foundational visual states

Every button, tab, input, node, and drop target has default, hover, focus-visible, active/selected, disabled, and error behavior where applicable. Runtime uses explicit DEMO and GATEWAY labels; mocked execution never uses production-success language without the DEMO context.

### Buttons and actions

Primary is reserved for the next safe action (`Start run`, `Save`). Secondary is outlined for utilities. Destructive actions use the danger color and remain separated from routine actions. Important actions retain stable dimensions while busy.

### Navigation and data display

Canvas and Specification are peer tabs in the workspace. The right operations rail is not a route; it is persistent context for the selected task and active run. Progress rows preserve task order and logs use monospace with bounded internal scrolling.

### Forms and overlays

Fields use visible labels and app-owned inline errors. Switch cases use an explicit list editor with both click and drag-add paths. The drag path is progressive enhancement; the Add case button is always available. There are no browser-native dialogs in the authoring surface.

### Iconography

The current symbol set is lightweight text/icon glyphs with colored containers. Keep icons supportive, preserve a visible label for actions, and do not add icon-only controls without an accessible name.

### Motion

Motion is restrained and functional: short hover elevation, fit-to-view transitions, and a save pulse communicate state. Reduce motion to instant or opacity-only transitions under `prefers-reduced-motion: reduce`.

### Content and data visualization

Copy uses direct technical verbs: Save, Validate, Start run, Cancel, Refresh, Add case. Runtime logs are diagnostic evidence, not marketing copy. Mocked endpoint names in the sample workflow are intentionally illustrative and never imply network access in DEMO mode.

## Do's and Don'ts

- **Do:** Keep the workflow artifact and its diagnostic controls visible in the same desktop view.
- **Do:** Use the same semantic action, state, and focus treatment across canvas, Inspector, Specification, and Runtime.
- **Don't:** Put runtime controls below a tall canvas where they change the canvas footprint or become difficult to discover.
- **Don't:** Use tiny muted text, decorative card repetition, or color-only state cues to carry operational meaning.
