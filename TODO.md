# Open Workflow Editor — Project Review & Backlog

## Goal

Build a real, production-ready Open Workflow Specification authoring and simulation environment with visual drag-and-drop canvas authoring, complete task property inspectors, bidirectional YAML/JSON synchronization, deterministic auto-layout, schema validation, multi-workflow lifecycle management, and a hardened separation between authoring, simulation, and remote runtime execution.

---

## Complete Project Review

### 1. Architecture & Foundation

- **Canvas Projection (`@xyflow/react` + ELK.js):** Canvas uses React Flow with customized node types (`WorkflowNode`, `PortNode`), smoothstep edge routing, auto-layout with layer-sweep minimization, and manual drag-to-reposition capabilities.
- **Specification Engine (`@openworkflowspec/sdk` + `js-yaml`):** The Open Workflow SDK validates documents against specification version `1.0.3` and generates the flat semantic graph. Due to SDK serializer constraints, `js-yaml` is utilized for clean YAML emission.
- **Persistence & Store (`src/workflowStore.ts`):** Versioned envelope storage in `localStorage` supporting a multi-workflow library with rename, duplicate, delete, and optimistic save state transitions (`saving` → `saved` / `error`). Canvas positions are decoupled from the Open Workflow specification document.
- **Runtime Separation (`src/runtimeAdapter.ts` & `src/demoRuntime.ts`):** Strict boundary between the local deterministic browser demo simulation (`DEMO`) and external production runtime gateway (`GATEWAY`).
- **Development Sandbox (`server/javascriptSandbox.js`):** Isolated worker thread running Node `vm` with strict memory/byte/timeout bounds to execute inline JavaScript functions (`run.script`) safely during local demo runs.

### 2. Implemented Features & Verification

- **12 Task Types Supported:** `set`, `call`, `switch`, `do`, `for`, `fork`, `emit`, `listen`, `raise`, `run`, `try`, `wait`.
- **Property Inspector:** Task-specific visual editors for `set`, `call`, `switch`, `wait`, `emit`, `raise`, `do`, and `run` (JavaScript & sub-flows), plus shared options (`if`, `then`, `timeout`, `input`, `output`, `export`, `metadata`) and a typed JSON Object Builder.
- **Specification Sync:** Bidirectional live synchronization between visual canvas and code view (YAML/JSON) with error boundary preservation.
- **Smart City Workflows:** 4 verified Dubai Government service flows (RTA nol Pass renewal, RTA vehicle ownership renewal, RTA family nol cards, DEWA Move-To).
- **Test Coverage:** Vitest unit suite (23 tests passing) and Playwright browser integration suite for drag/drop, properties, auto-layout, focus mode, and undo/redo.

### 3. Identified Technical Debt & Gaps

- **Monolithic UI Component (resolved in Phase 10.1):** `src/main.jsx` was reduced from ~3,074 lines to ~900 lines (App shell + persistence). UI now lives in `src/components/{common,canvas,inspector,runtime,layout}/` with shared helpers in `src/taskMeta.ts`, `src/formatters.ts`, and `src/runtimeStatus.ts`.
- **Inspector Form Completeness:** `for`, `fork`, `listen`, and `try/catch` tasks currently rely on raw JSON/text or nested lists rather than dedicated visual form builders.
- **Canvas Sub-Graph Visual Editing:** Nested container tasks (`do`, `for.do`, `fork.branches`, `try`) are represented as flat/grouped nodes without direct visual drag-into-container canvas interaction.
- **TypeScript Strictness (largely resolved in Phase 10.2):** All non-React modules are strictly typed with `strict: true`. Remaining `.jsx` components and the test file convert best alongside the Phase 12.1 Inspector decomposition.
- **Formatting Consistency (resolved in Phase 15.1):** Prettier formatting is applied repo-wide, `format:check` passes, and both Prettier and ESLint (including react-hooks rules) run in CI.
- **Production Runtime Gateway:** Java SDK reference gateway service is defined by contract and security specifications, but deployment integration remains open.

---

## Completed Phases (0 – 9)

- [x] **Phase 0 — Baseline and Cleanup:** Product rebranding, empty state, sample fixtures, test scripts.
- [x] **Phase 1 — Dependencies & Editor Foundation:** React Flow, SDK parser, semantic graph mapping, keyboard navigation.
- [x] **Phase 2 — Drag-and-Drop Authoring:** 12 task templates, canvas drag-and-drop, connection validation, cycle prevention.
- [x] **Phase 3 — Node Editing & Properties Inspector:** Task forms (`set`, `call`, `switch`, `do`, `emit`, `wait`, `raise`), switch case builder, common field editor.
- [x] **Phase 4 — Specification Synchronization:** Live YAML/JSON sync, conflict safety, export/import, clipboard actions.
- [x] **Phase 5 — Layout & Usability:** ELK.js layered layout, manual/auto toggle, minimap, responsive layout, collapsible rails.
- [x] **Phase 6 — Persistence & Lifecycle:** Versioned storage envelope, multi-workflow switcher, duplicate/rename/delete, dirty-state protection.
- [x] **Phase 7 — Validation & Quality Gates:** SDK schema validation, graph diagnostics (unreachable tasks, dangling targets, cycles), unit & E2E tests.
- [x] **Phase 8 — Runtime Boundary Definition:** Runtime adapter contract, disconnected gateway mapping, server-only credentials contract, security review.
- [x] **Phase 9 — Demo Engine & Sandbox:** Deterministic browser simulation, Node worker sandbox, Dubai Government cases, structured event timeline.

---

## Actionable Backlog & Future Tasks

### Phase 10 — Code Architecture & Modularization

- [x] **10.1 Refactor Monolithic `src/main.jsx` into Modular Components** (`main.jsx`: 3,073 → 897 lines; verified by unit, lint, and 18 browser tests):
  - [x] Extract reusable form controls (`JsonObjectBuilder`, `DurationField`, `KeyValuePairs`) to `src/components/common/`.
  - [x] Extract canvas components (`WorkflowNode`, `PortNode`, `EditorCanvas`) to `src/components/canvas/`.
  - [x] Extract inspector (`Inspector` + switch-case helpers) to `src/components/inspector/`. Note: `Inspector` is still one ~830-line component; per-task-form decomposition (`SwitchCaseEditor`, `ScriptTaskEditor`, `SubflowEditor`) is folded into Phase 12.1.
  - [x] Extract runtime panel and log components (`RuntimePanel`, `RuntimeLogList`) to `src/components/runtime/`.
  - [x] Extract layout components (`Palette`, `ConfirmDialog`) to `src/components/layout/`. Note: top bar / workspace header markup remains inline in `App` (no standalone components existed to extract).
- [ ] **10.2 TypeScript Migration:**
  - [~] Convert `.js`/`.jsx` files to `.ts`/`.tsx` (staged): all non-React modules are done — `types`, `scriptContract`, `taskMeta`, `formatters`, `runtimeStatus`, `workflowStore`, `workflowModel`, `runtimeAdapter`, `demoRuntime`, fixture. Remaining: React components (`.jsx`) and `workflowModel.test.js`, best converted alongside the Phase 12.1 Inspector decomposition.
  - [x] Define comprehensive TypeScript interfaces for Open Workflow AST, graph models, and editor store state (`src/types.ts`: `TaskDefinition`, `WorkflowDocument`, `FlowGraph`/`FlowNode`/`FlowEdge`, `WorkflowRecord`, `CanvasPositions`, `WorkflowPersistence`, `SaveState`; SDK interop typed via `GraphNodeType` and derived `SdkWorkflow`).
  - [x] Enable strict type-checking in `tsconfig.json` (`strict: true`, `checkJs: false` so unconverted files stay incremental; `tsc --noEmit` clean).
- [x] **10.3 Bundle & Performance Optimization:**
  - [x] Lazy load `elkjs/lib/elk.bundled.js` with dynamic `import()` (verified: `workflowModel.getElk` uses a cached dynamic import; `index.html` carries no eager reference).
  - [x] Optimize chunk splitting in `vite.config.js` for vendor libraries (`react`/`react-dom`, `@xyflow/react`, `@openworkflowspec/sdk` + `js-yaml`): eager bundle reduced 777 KB → 90 KB; elkjs stays a lazy standalone chunk.

### Phase 11 — Canvas & Visual Authoring Enhancements

- [ ] **11.1 Hierarchical & Nested Canvas Authoring:**
  - [ ] Implement nested visual container frames for `do`, `for.do`, `fork.branches`, and `try`/`catch` blocks on the canvas.
  - [ ] Support dragging tasks from palette directly into nested container drop zones.
  - [ ] Enable visual intra-scope connections between nested child tasks.
- [ ] **11.2 Advanced Canvas Operations:**
  - [ ] Add multi-node box selection, batch deletion, batch duplication, and canvas alignment tools (align left/center/right, distribute vertically/horizontally).
  - [ ] Add canvas node search & filter toolbar (search by task name, filter by task type or validation status).
  - [ ] Add minimap zoom-to-selection and visual viewport indicators.
- [ ] **11.3 Diagram Export & Visual Documentation:**
  - [ ] Add canvas export to high-resolution PNG and SVG images.
  - [ ] Add workflow simulation path highlighting and exportable execution trace diagrams.

### Phase 12 — Inspector & Schema Completeness

- [ ] **12.1 Dedicated Task Inspectors for Remaining Task Types:**
  - [ ] **`for` Inspector:** Visual builder for `each` item variable, `in` collection expression, and nested task list.
  - [ ] **`fork` Inspector:** Visual parallel branch manager (add/remove branches, set branch names, configure branch tasks).
  - [ ] **`listen` Inspector:** Visual event listener editor for `to.one.with`, `to.any`, event sources, types, correlation keys, and `read` mappings.
  - [ ] **`try` / `catch` Inspector:** Visual editor for `try` task list, `catch.errors` filters, `catch.retry` backoff policies, and fallback actions.
- [ ] **12.2 Expression & Context Autocomplete:**
  - [ ] Provide intelligent autocomplete for `${ $context... }`, `${ $input... }`, and `${ $catalogs... }` expressions across all input fields.
  - [ ] Add syntax validation for runtime expressions with instant error highlighting.
- [ ] **12.3 JSON Schema Validation in Object Builder:**
  - [ ] Support visual schema validation for structured HTTP headers, query params, and body objects.
  - [ ] Enable recursive nested objects/arrays in `JsonObjectBuilder` without falling back to raw JSON text.

### Phase 13 — Production Runtime Gateway & Sandbox Hardening

- [ ] **13.1 Java SDK Reference Runtime Gateway Service:**
  - [ ] Build server-side gateway wrapping the Open Workflow Specification Java SDK (7.x line).
  - [ ] Implement authenticated `/validate`, `/runs`, `/runs/{id}`, `/runs/{id}/cancel`, and `/runs/{id}/logs` endpoints matching `src/runtimeAdapter.ts`.
  - [ ] Implement secure credential resolution, upstream endpoint allowlists, and tenant-scoped audit logging.
- [ ] **13.2 Expression Engine Conformance:**
  - [ ] Align demo runtime expression evaluator with full Open Workflow Specification runtime expression specification (JSONata / JQ / logical operators).
- [ ] **13.3 Sandbox Isolation Hardening:**
  - [ ] Migrate Node JavaScript worker from `node:vm` to containerized microVM isolation (e.g. gVisor, Docker isolate) for hostile multi-tenant workloads.
  - [ ] Implement execution timeouts, memory ceilings, and per-tenant rate limiting.

### Phase 14 — Persistence, Collaboration & Ecosystem

- [ ] **14.1 Remote API Persistence Adapter:**
  - [ ] Implement REST / GraphQL persistence adapter conforming to `src/workflowStore.ts` `assertWorkflowPersistence`.
  - [ ] Add optimistic concurrency control, conflict resolution dialog, and configurable auto-save.
- [ ] **14.2 Version Control & Visual Workflow Diffing:**
  - [ ] Track workflow revision history with author metadata, timestamps, and commit messages.
  - [ ] Visual graph diff view comparing two workflow revisions side-by-side with color-coded additions, deletions, and modifications.
- [ ] **14.3 Enterprise Template & Catalog Browser:**
  - [ ] Add template catalog for common integrations (Kafka, Slack, AWS Lambda, Azure Functions, GCP Cloud Tasks).
  - [ ] Add interactive OpenAPI / AsyncAPI import to register endpoints into `use.catalogs`.

### Phase 15 — Quality, Accessibility & Performance

- [x] **15.1 Code Formatting & Linting Pipeline:**
  - [x] Format all codebase files with Prettier (`npm run format`); `npm run format:check` passes and runs in CI.
  - [x] Configure ESLint rules for React Hooks (`react-hooks/rules-of-hooks` as error, `react-hooks/exhaustive-deps` as warning) and resolve all findings.
  - [x] Add GitHub Actions CI (`.github/workflows/ci.yml`): lint, format check, typecheck, unit tests, build, and Playwright browser tests on every push/PR.
- [ ] **15.2 Accessibility Hardening (WCAG 2.1 AA):**
  - [ ] Ensure full keyboard navigation across canvas nodes, ports, edge connections, and property panels.
  - [ ] Implement high-contrast theme and dark mode support.
- [ ] **15.3 Test Suite Expansion:**
  - [ ] Add unit tests for all remaining task inspectors (`for`, `fork`, `listen`, `try`).
  - [ ] Add Playwright browser tests covering undo/redo with auto-layout, subflow creation, and multi-file import/export workflows.
