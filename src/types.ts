/**
 * Shared editor-side model types.
 *
 * Comprehensive TypeScript interfaces for Open Workflow AST, graph models,
 * and editor store state.
 */

/**
 * Open Workflow Specification task types the editor supports, plus the
 * prototype AI task families (`llm-call`, `ai-agent-call`) that will be
 * implemented once the DSL/schema support lands; they appear in the palette
 * as "coming soon" entries.
 */
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
  | 'wait'
  | 'llm-call'
  | 'ai-agent-call';

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
  | 'purple'
  | 'magenta';

/**
 * A single task definition inside a `do` list entry. The editor reads and
 * mutates these structures dynamically, so known task keys are declared
 * with structural shapes plus a catch-all index signature.
 */
export interface TaskDefinition {
  set?: Record<string, unknown>;
  call?: string;
  with?: Record<string, unknown>;
  switch?: Array<Record<string, { when?: unknown; then?: string }>>;
  do?: TaskItem[];
  for?: { each?: string; in?: unknown; at?: string; [key: string]: unknown };
  fork?: { branches?: TaskItem[]; compete?: boolean; [key: string]: unknown };
  try?: TaskItem[];
  catch?: {
    errors?: { with?: { type?: string } } | string[];
    retry?: {
      delay?: string;
      limit?: { attempt?: { count?: number } };
      max?: number;
      backoff?: unknown;
      [key: string]: unknown;
    };
    do?: TaskItem[];
    [key: string]: unknown;
  };
  raise?: { error?: { type?: string; [key: string]: unknown } };
  wait?: string;
  emit?: { event?: { with?: Record<string, unknown> } };
  listen?: {
    to?: {
      one?: { with?: EventFilter };
      any?: Array<{ with?: EventFilter }>;
    };
    read?: string;
    [key: string]: unknown;
  };
  run?: {
    script?: { language?: string; code?: string; [key: string]: unknown };
    workflow?: { namespace?: string; name?: string; version?: string };
    [key: string]: unknown;
  };
  if?: string;
  then?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  export?: Record<string, unknown>;
  timeout?: string;
  metadata?: Record<string, unknown>;
  /** Prototype AI task families (planning stage; defined once the DSL/schema supports them). */
  'llm-call'?: Record<string, unknown>;
  'ai-agent-call'?: Record<string, unknown>;
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
 * normalized document (`document`, `do`, `use`, …).
 */
export interface WorkflowDocument {
  document?: { name?: string; namespace?: string; version?: string; [key: string]: unknown };
  do?: TaskItem[];
  use?: {
    catalogs?: Record<string, unknown>;
    functions?: Record<string, TaskDefinition>;
    [key: string]: unknown;
  };
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
  isHighlighted?: boolean;
  isDimmed?: boolean;
  executionStatus?: 'running' | 'success' | 'failed' | 'waiting';
  [key: string]: unknown;
}

/** A React Flow projection node (task or port). */
export interface FlowNode {
  id: string;
  type?: 'task' | 'port' | string;
  position: CanvasPosition;
  data: FlowNodeData;
  draggable?: boolean;
  selectable?: boolean;
  selected?: boolean;
  [key: string]: unknown;
}

/** A React Flow projection edge. */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  label?: string;
  data?: { label: string };
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
  /** Set on unresolved sub-flow reference issues — the delegating target. */
  subflowTarget?: { namespace: string; name: string };
}

/** A saved revision snapshot of a workflow specification. */
export interface WorkflowRevision {
  id: string;
  timestamp: number;
  specification: string;
  format: WorkflowFormat;
  summary?: string;
}

/** A workflow entry in the multi-workflow library. */
export interface WorkflowRecord {
  id: string;
  name: string;
  specification: string;
  format: WorkflowFormat;
  positions: CanvasPositions;
  updatedAt: number;
  revisions?: WorkflowRevision[];
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

/** Application visual theme mode. */
export type AppTheme = 'light' | 'dark' | 'high-contrast';
