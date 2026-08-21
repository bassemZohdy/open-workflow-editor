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
  'set' | 'call' | 'switch' | 'do' | 'for' | 'fork' | 'emit' | 'listen' | 'raise' | 'run' | 'try' | 'wait';

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
 * A single task definition inside a `do` list entry. The editor reads and
 * mutates these structures dynamically, so the known task keys are declared
 * with loose structural shapes plus a catch-all index signature.
 */
export interface TaskDefinition {
  set?: Record<string, unknown>;
  call?: string;
  with?: Record<string, unknown>;
  switch?: Array<Record<string, { when?: unknown; then?: string }>>;
  do?: TaskItem[];
  for?: { each?: string; in?: unknown };
  fork?: { branches?: TaskItem[] };
  try?: TaskItem[];
  catch?: { do?: TaskItem[] };
  raise?: { error?: { type?: string; [key: string]: unknown } };
  wait?: string;
  emit?: { event?: { with?: Record<string, unknown> } };
  listen?: {
    to?: {
      one?: { with?: EventFilter };
      any?: Array<{ with?: EventFilter }>;
    };
  };
  run?: {
    script?: { language?: string; code?: string };
    workflow?: { namespace?: string; name?: string; version?: string };
  };
  then?: string;
  [key: string]: unknown;
}

/** One `{ taskName: definition }` entry in a task list. */
export type TaskItem = Record<string, TaskDefinition>;

/** Event filter shape used by `listen` tasks. */
export interface EventFilter {
  source?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * A parsed workflow specification document. Structurally the SDK's
 * normalized document (`document`, `do`, `use`, …), kept loose until the
 * parser module is fully typed.
 */
export interface WorkflowDocument {
  document?: { name?: string; [key: string]: unknown };
  do?: TaskItem[];
  use?: { catalogs?: Record<string, unknown>; [key: string]: unknown };
  schedule?: { every?: string; cron?: string; after?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** A parsed workflow specification document plus its semantic graph. */
export interface ParsedWorkflow {
  document: WorkflowDocument;
  graph: unknown;
}

/** Serialization format for the specification text. */
export type WorkflowFormat = 'yaml' | 'json';

/** Canvas node positions, keyed by node id, decoupled from the specification. */
export type CanvasPositions = Record<string, { x: number; y: number }>;

/** A single canvas node position. */
export interface CanvasPosition {
  x: number;
  y: number;
}

/** Data payload carried by task and port nodes on the canvas. */
export interface FlowNodeData {
  label: string;
  taskType: string;
  taskReference?: string;
  task?: unknown;
  portType?: string;
}

/** A React Flow projection node (task or port). */
export interface FlowNode {
  id: string;
  type: 'task' | 'port';
  position: CanvasPosition;
  data: FlowNodeData;
  draggable: boolean;
  selectable: boolean;
}

/** A React Flow projection edge. */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  label?: string;
  data: { label: string };
  animated: boolean;
}

/** The full canvas projection of a workflow document. */
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** A graph diagnostic issue reported by `validateGraph`. */
export interface GraphIssue {
  path: string;
  message: string;
}

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
