import type {
  CanvasPositions,
  SaveState,
  StorageLike,
  WorkflowDocument,
  WorkflowFormat,
  WorkflowPersistence,
  WorkflowRecord,
} from './types';

export const WORKFLOW_LIBRARY_VERSION = 1;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface CreateWorkflowRecordInput {
  id: string;
  document: WorkflowDocument;
  specification: string;
  format?: WorkflowFormat;
  positions?: CanvasPositions;
  updatedAt?: number;
}

export function createWorkflowRecord({
  id,
  document,
  specification,
  format = 'yaml',
  positions = {},
  updatedAt = Date.now(),
}: CreateWorkflowRecordInput): WorkflowRecord {
  return {
    id,
    name: document?.document?.name || 'untitled-workflow',
    specification,
    format: format === 'json' ? 'json' : 'yaml',
    positions: clone(positions),
    updatedAt,
  };
}

export function parseWorkflowLibrary(raw: string | null): WorkflowRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== WORKFLOW_LIBRARY_VERSION ||
      !Array.isArray((parsed as { workflows?: unknown }).workflows)
    ) {
      return [];
    }
    return (parsed as { workflows: unknown[] }).workflows
      .filter(
        (record): record is Record<string, unknown> =>
          !!record &&
          typeof record === 'object' &&
          typeof (record as { id?: unknown }).id === 'string' &&
          typeof (record as { specification?: unknown }).specification === 'string',
      )
      .map((record) => ({
        ...(record as unknown as WorkflowRecord),
        name: (record.name as string) || 'untitled-workflow',
        format: record.format === 'json' ? 'json' : 'yaml',
        positions:
          record.positions && typeof record.positions === 'object'
            ? (record.positions as CanvasPositions)
            : {},
      }));
  } catch {
    return [];
  }
}

export function serializeWorkflowLibrary(workflows: WorkflowRecord[]): string {
  return JSON.stringify({ version: WORKFLOW_LIBRARY_VERSION, workflows }, null, 2);
}

export function upsertWorkflowRecord(workflows: WorkflowRecord[], record: WorkflowRecord): WorkflowRecord[] {
  const next = workflows.filter((item) => item.id !== record.id);
  next.push(clone(record));
  return next.sort((left, right) => left.name.localeCompare(right.name));
}

export function removeWorkflowRecord(workflows: WorkflowRecord[], id: string): WorkflowRecord[] {
  return workflows.filter((record) => record.id !== id);
}

export function uniqueWorkflowName(workflows: WorkflowRecord[], baseName: string): string {
  const names = new Set(workflows.map((record) => record.name));
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) suffix += 1;
  return `${baseName}-${suffix}`;
}

export function createWorkflowPersistence(
  storage: StorageLike,
  key = 'open-workflow-editor:library',
): WorkflowPersistence {
  return {
    list() {
      return parseWorkflowLibrary(storage.getItem(key));
    },
    replace(workflows) {
      storage.setItem(key, serializeWorkflowLibrary(workflows));
    },
    clear() {
      storage.removeItem(key);
    },
  };
}

export function assertWorkflowPersistence(adapter: unknown): WorkflowPersistence {
  const candidate = adapter as Partial<WorkflowPersistence> | null | undefined;
  const required: Array<keyof WorkflowPersistence> = ['list', 'replace', 'clear'];
  const missing = required.filter((operation) => typeof candidate?.[operation] !== 'function');
  if (missing.length) throw new TypeError(`Workflow persistence is missing: ${missing.join(', ')}.`);
  return adapter as WorkflowPersistence;
}

export async function replaceWorkflowRecordsWithState(
  persistence: WorkflowPersistence,
  workflows: WorkflowRecord[],
  onState: (state: SaveState) => void = () => {},
): Promise<void> {
  onState({ status: 'saving', error: null });
  try {
    await persistence.replace(workflows);
    onState({ status: 'saved', error: null });
  } catch (error) {
    onState({ status: 'error', error });
    throw error;
  }
}
