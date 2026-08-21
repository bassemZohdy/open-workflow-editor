# Open Workflow Editor — Backlog

## Goal

Build a real Open Workflow Specification authoring application with drag-and-drop node creation, editable task properties, connectable workflow paths, YAML/JSON synchronization, validation, persistence, and a clear separation between authoring and runtime execution.

## Current status

The current authoring and runtime-boundary slice is implemented: the app uses React Flow as its primary canvas, the Open Workflow SDK as its parser/validator/graph source, exposes schema-valid templates for all twelve task types, supports palette drag/drop with drop feedback, node movement, selection, deletion, task-aware editing for the core task forms, raw JSON editing, cycle-safe connections, graph diagnostics, undo/redo, YAML/JSON editing, import/export, versioned multi-workflow local persistence, dirty-state protection, explicit loading/error states, live validation, a deterministic browser-local demo engine, a server-gateway HTTP adapter, and an explicitly separated run panel. Vitest and Playwright cover the adapter, demo runtime, and browser flows; runtime selection, server-only configuration, and the security gate are documented. Gateway deployment remains an external integration step.

## Architecture decision

- Use `@xyflow/react` as the primary editable canvas.
- Use `@openworkflowspec/sdk` for parsing, validation, graph generation, task identity, and JSON model normalization; use `js-yaml` for YAML emission because the current SDK class serializer fails on its own class instances.
- Use React state or a dedicated editor store as the source of truth for the workflow document and canvas state.
- Use the SDK graph as the semantic graph and React Flow nodes/edges as the visual projection.
- Use ELK.js for deterministic auto-layout where the workflow structure permits it.
- Do not treat `@openworkflowspec/diagram-editor` as the authoring engine; its current public API does not expose the editing behavior required here.
- Remove the simulated “Run workflow” behavior. Runtime execution will be a separate integration boundary.

## Phase 0 — Baseline and cleanup

- [x] Rename the application from “Workflow Atlas” to “Open Workflow Editor”.
- [x] Replace temporary product copy that implies a connected production workspace.
- [x] Remove the simulated run button and success toast, or label it explicitly as a future runtime integration.
- [x] Decide whether to retain `@openworkflowspec/diagram-editor` as an optional read-only preview tab; default recommendation is to remove it from the primary path.
- [x] Add a clear empty state for a new workflow.
- [x] Add a sample workflow fixture that covers sequential tasks, branching, nested tasks, and task properties.
- [x] Establish formatting, linting, type-checking, and test scripts for the app.

## Phase 1 — Dependencies and editor foundation

- [x] Add direct dependencies for `@xyflow/react`, `@openworkflowspec/sdk`, and ELK.js.
- [x] Add TypeScript configuration or migrate the app from JSX to TypeScript. (JSX remains JavaScript; `tsconfig.json` provides no-emit checking.)
- [x] Create an editor state model containing workflow document, React Flow nodes, edges, selection, validation errors, dirty state, and history.
- [x] Create a workflow adapter module with explicit conversions (`src/workflowModel.js`):
  - [x] YAML/JSON text → SDK workflow document.
  - [x] SDK workflow document → semantic graph.
  - [x] Semantic graph → React Flow nodes and edges.
  - [x] Supported React Flow edits → validated Open Workflow document.
- [x] Preserve stable task identities using SDK task references or a project-owned identity map.
- [x] Define error states for invalid YAML, invalid Open Workflow documents, unsupported task types, and conversion failures.
- [x] Add a basic editable canvas with pan, zoom, select, keyboard focus, and fit-to-view.

## Phase 2 — Drag-and-drop authoring

- [x] Build a node palette for supported task types: `call`, `set`, `switch`, `do`, `for`, `fork`, `emit`, `listen`, `raise`, `run`, `try`, and `wait`.
- [x] Implement drag from the palette into the canvas.
- [x] Create a valid task/document fragment when a palette item is dropped.
- [x] Generate stable task names and prevent duplicate names within the same task list.
- [x] Add visual drop targets and invalid-drop feedback.
- [x] Support moving nodes on the canvas and persist positions separately from workflow semantics.
- [x] Support selecting one or multiple nodes.
- [x] Support deleting nodes with confirmation or undo recovery.
- [x] Support connecting compatible handles with validation.
- [x] Support removing and reconnecting edges.
- [x] Prevent invalid graph operations such as illegal cycles or incompatible branch connections where the DSL disallows them.
- [x] Add keyboard shortcuts for delete, duplicate, undo, redo, select all, and fit view.

## Phase 3 — Node editing and properties panel

- [x] Create a properties inspector for the selected task.
- [x] Allow editing the task name while preserving identity and references.
- [x] Add task-specific forms for the first supported task set:
  - [x] `set` data.
  - [x] `call` command/endpoint and `with` values.
  - [x] `switch` conditions and flow targets.
  - [x] `do` nested task list.
  - [x] `emit` event type/data.
  - [x] `wait` duration/until. (Duration is editable; absolute `until` remains available in raw JSON.)
  - [x] `raise` error type/status/data.
- [x] Support multiple `switch` cases with inspector add/remove controls and a drag-and-drop case drop zone.
- [x] Add common task fields: `if`, `input`, `output`, `export`, `timeout`, `then`, and `metadata`.
- [x] Show unsupported task fields without silently dropping them. (Raw task JSON remains available and common-field edits preserve other keys.)
- [x] Provide raw JSON editing for advanced task fields; YAML editing remains available in the specification view.
- [x] Validate property changes immediately and show field-level errors. (Changes validate on commit/blur.)
- [x] Keep the inspector and canvas selection synchronized.

## Phase 4 — Specification synchronization

- [x] Add a specification editor with YAML and JSON modes.
- [x] Parse specification edits through the SDK instead of applying string substitutions.
- [x] Update the canvas after valid specification edits.
- [x] Preserve unsaved text when the specification is invalid and show the exact parse/validation error.
- [x] Update YAML when canvas or inspector edits are made.
- [x] Make synchronization conflict-safe so canvas edits do not overwrite newer text edits unexpectedly. (Canvas edits are blocked while a newer specification draft is invalid.)
- [x] Add formatting/normalization controls.
- [x] Add import from local YAML/JSON files.
- [x] Add export to YAML and JSON files.
- [x] Add copy-to-clipboard actions with error handling.

## Phase 5 — Layout, usability, and visual quality

- [x] Add deterministic auto-layout using ELK.js.
- [x] Add manual layout mode so users can reposition nodes after auto-layout.
- [x] Persist canvas positions without polluting the Open Workflow document.
- [x] Add minimap, zoom controls, grid/background, and fit-to-content.
- [x] Add a node legend and clear visual states for task types, branches, errors, and selected items.
- [x] Add empty, loading, parsing-error, validation-error, and unsupported-task states. (Hydration/import states, empty canvas state, classified parse/validation errors, and explicit unsupported-task feedback are implemented.)
- [x] Make the canvas usable at laptop and large-monitor widths.
- [x] Add keyboard navigation and accessible labels for canvas controls.
- [x] Verify color contrast and focus states.
- [x] Remove fake workspace/team/owner data unless backed by real persistence.

## Phase 6 — Persistence and workflow lifecycle

- [x] Define the persisted workflow format and version it.
- [x] Persist workflow text, metadata, canvas positions, and editor preferences separately.
- [x] Add local browser persistence for the first milestone.
- [x] Add new workflow, duplicate workflow, rename workflow, and delete workflow actions.
- [x] Add dirty-state tracking and unsaved-change protection.
- [x] Add restore-from-local-storage behavior.
- [x] Add an abstraction for replacing local persistence with an API later.
- [x] Add optimistic save/error states when a remote persistence adapter is introduced. (The editor now applies the saved-record state optimistically and exposes `saving`, `saved`, and `error` transitions; the current adapter remains local.)

> Deferred intentionally: the editor currently uses the local adapter. A generic optimistic save contract is in place; production remote persistence still starts when an API-backed adapter is approved.

## Phase 7 — Validation and quality gates

- [x] Validate every workflow with `@openworkflowspec/sdk` before save/export.
- [x] Surface schema errors with task and field references where possible.
- [x] Add graph-level validation for dangling references, invalid connections, unreachable tasks, and unsupported structures.
- [x] Add test fixtures for all supported task types.
- [x] Unit-test YAML/JSON ↔ SDK ↔ graph ↔ React Flow conversions.
- [x] Unit-test task creation, rename, delete, connect, disconnect, and reorder operations.
- [x] Add undo/redo tests. (Playwright covers keyboard undo and redo.)
- [x] Add browser tests for palette drag/drop and property editing.
- [x] Add import/export round-trip tests. (YAML and JSON adapter round-trips are covered.)
- [x] Add build, lint, format, type-check, and test commands to the project README.

## Phase 8 — Runtime boundary (separate from the editor)

- [x] Remove any wording that implies the editor executes workflows.
- [x] Define a runtime adapter interface with `validate`, `start`, `status`, `cancel`, and `logs` operations. (Includes the disconnected adapter and server-gateway HTTP mapping in `src/runtimeAdapter.js`.)
- [x] Decide which Open Workflow runtime will execute workflows. (The first target is the Open Workflow Specification Java SDK reference implementation behind a server-side gateway; see [`docs/runtime-decision.md`](docs/runtime-decision.md).)
- [x] Add credentials and environment configuration outside the browser bundle. (Added a server-only environment contract in `server/runtimeGatewayConfig.js`; runtime gateway implementation and deployment wiring remain part of the next integration milestone.)
- [x] Add a real run panel only after a runtime adapter exists. (The panel defaults to the local demo adapter and exposes the HTTP gateway as a separate mode.)
- [x] Display run inputs, execution status, task-level progress, failures, retries, and logs. (The panel renders both demo results and gateway status/progress/outcome/log payloads and polls active runs.)
- [x] Add explicit security review for secrets, endpoints, and user-supplied expressions. (Review and release gate documented in [`docs/security-review.md`](docs/security-review.md); execution remains disabled until the gateway satisfies it.)

> Deferred intentionally: the local demo engine is available for debug and demonstration, but actual gateway execution and production telemetry require deployment wiring. See `docs/runtime-boundary.md`, [`docs/runtime-decision.md`](docs/runtime-decision.md), and [`docs/security-review.md`](docs/security-review.md).

## Phase 9 — Debug and demonstration runtime

- [x] Add a deterministic local demo engine with no network calls or credentials.
- [x] Simulate task progress, nested tasks, calls, waits, events, branches, failures, cancellation, and logs.
- [x] Add explicit Demo engine and Runtime gateway modes to the run panel.
- [x] Keep demo and gateway status visually distinct and label mocked execution in the UI.
- [x] Add clear Dubai Government service cases with official references, including scheduler- and event-triggered flows.
- [x] Add structured demo runtime diagnostics for triggers, active tasks, branches, service calls, transitions, and durations.
- [x] Make auto-layout refit the measured canvas after branched graph coordinates are applied.
- [x] Replace structured parameter textareas with typed key/value builders and ISO duration controls.
- [x] Add expandable, bounded runtime log entries with expand-all and collapse-all actions.
- [x] Add unit and browser coverage for local demo runs.
- [x] Replace the shell palette task with schema-valid inline JavaScript (`run.script`).
- [x] Add a bounded Node worker sandbox endpoint for JavaScript task demonstrations.
- [x] Add the sandboxed eligibility transform to the RTA nol renewal example.
- [x] Validate JavaScript run tasks as structured functions with input/context/catalog descriptors and JSON output.
- [x] Add Open Workflow resource catalog editing and schema-valid sub-flow references to the Run inspector.
- [x] Add visible Inspector task deletion with an accessible confirmation and undo recovery.

## Suggested milestone order

1. Baseline cleanup and TypeScript/editor foundation.
2. Read-only SDK graph projection using React Flow.
3. Drag/drop task creation and node movement.
4. Properties panel for `set`, `call`, and `switch`.
5. YAML synchronization and validation.
6. Persistence, undo/redo, import/export, and auto-layout.
7. Broader task coverage and accessibility hardening.
8. Runtime adapter as a separate project milestone.

## Definition of done for the first usable authoring release

- [x] A user can create a workflow from an empty canvas.
- [x] A user can drag `set`, `call`, and `switch` tasks onto the canvas.
- [x] A user can move, connect, delete, and configure those tasks.
- [x] The resulting workflow is valid Open Workflow Specification YAML.
- [x] YAML changes update the canvas, and canvas changes update YAML.
- [x] Invalid documents remain editable and show actionable validation errors.
- [x] The workflow can be saved locally, reopened, exported, and imported.
- [x] There is no simulated runtime action presented as real execution.
- [x] Automated tests cover the core conversion and editing flows.
