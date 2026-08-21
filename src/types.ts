/**
 * Shared editor-side model types.
 *
 * Stage 1 of the TypeScript migration (Phase 10.2): these are pragmatic
 * structural types for the editor state model. The canonical Open Workflow
 * AST types are provided by `@openworkflowspec/sdk`; the loose
 * `WorkflowDocument` alias below will be tightened when `workflowModel`
 * itself migrates to TypeScript.
 */

/** The twelve Open Workflow Specification task types the editor supports. */
export type TaskType =
  | 'set'
  | 'call'
  | 'switch'
  | 'do'
  | 'for'
  | 'fork'
  | 'emit'
  | 'listen'
  | 'raise'
  | 'run'
  | 'try'
  | 'wait';

/** Accent color tokens used by palette items and canvas nodes. */
export type TaskColor =
  | 'blue'
  | 'violet'
  | 'amber'
  | 'green'
  | 'cyan'
  | 'rose'
  | 'orange'
  | 'teal'
  | 'red'
  | 'slate'
  | 'indigo'
  | 'purple';

/**
 * A parsed workflow specification document. Structurally the SDK's
 * normalized document (`document`, `do`, `use`, …), kept loose until the
 * parser module is fully typed.
 */
export interface WorkflowDocument {
  document?: { name?: string; [key: string]: unknown };
  do?: unknown[];
  [key: string]: unknown;
}

/** A single parsed workflow plus its editor-side persistence metadata. */
export interface ParsedWorkflow {
  document: WorkflowDocument;
}

/** Serialization format for the specification text. */
export type WorkflowFormat = 'yaml' | 'json';

/** Canvas node positions, keyed by node id, decoupled from the specification. */
export type CanvasPositions = Record<string, { x: number; y: number }>;

/** A workflow entry in the multi-workflow library. */
export interface WorkflowRecord {
  id: string;
  name: string;
  specification: string;
  format: WorkflowFormat;
  positions: CanvasPositions;
  updatedAt: number;
}

/** Persistence envelope header for the workflow library. */
export interface WorkflowLibraryEnvelope {
  version: number;
  workflows: WorkflowRecord[];
}

/** Optimistic save-state transitions (`saving` → `saved` / `error`). */
export type SaveStatus = 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  error: unknown;
}

/** Minimal storage surface `createWorkflowPersistence` depends on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

/** Persistence adapter contract (see `assertWorkflowPersistence`). */
export interface WorkflowPersistence {
  list(): WorkflowRecord[];
  replace(workflows: WorkflowRecord[]): void | Promise<void>;
  clear(): void;
}
