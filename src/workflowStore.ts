import type {
  CanvasPositions,
  SaveState,
  StorageLike,
  WorkflowDocument,
  WorkflowFormat,
  WorkflowPersistence,
  WorkflowRecord,
  WorkflowRevision,
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
  revisions?: WorkflowRevision[];
}

export function createWorkflowRecord({
  id,
  document,
  specification,
  format = 'yaml',
  positions = {},
  updatedAt = Date.now(),
  revisions,
}: CreateWorkflowRecordInput): WorkflowRecord {
  const normFormat = format === 'json' ? 'json' : 'yaml';
  const initialRevisions: WorkflowRevision[] = revisions || [
    {
      id: `rev-${updatedAt}`,
      timestamp: updatedAt,
      specification,
      format: normFormat,
      summary: 'Initial revision',
    },
  ];

  return {
    id,
    name: document?.document?.name || 'untitled-workflow',
    specification,
    format: normFormat,
    positions: clone(positions),
    updatedAt,
    revisions: clone(initialRevisions),
  };
}

export function recordWorkflowRevision(record: WorkflowRecord, summary = 'Saved changes'): WorkflowRecord {
  const nextRevisions = clone(record.revisions || []);
  const latest = nextRevisions[0];

  if (!latest || latest.specification !== record.specification) {
    nextRevisions.unshift({
      id: `rev-${Date.now()}`,
      timestamp: Date.now(),
      specification: record.specification,
      format: record.format,
      summary,
    });
  }

  // Keep up to 30 revisions
  const capped = nextRevisions.slice(0, 30);

  return {
    ...record,
    revisions: capped,
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
      .map((record) => {
        const spec = String(record.specification);
        const format: WorkflowFormat = record.format === 'json' ? 'json' : 'yaml';
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : Date.now();
        const revisions: WorkflowRevision[] = Array.isArray(record.revisions)
          ? (record.revisions as WorkflowRevision[])
          : [
              {
                id: `rev-${updatedAt}`,
                timestamp: updatedAt,
                specification: spec,
                format,
                summary: 'Initial revision',
              },
            ];

        return {
          ...(record as unknown as WorkflowRecord),
          name: (record.name as string) || 'untitled-workflow',
          format,
          positions:
            record.positions && typeof record.positions === 'object'
              ? (record.positions as CanvasPositions)
              : {},
          revisions,
        };
      });
  } catch {
    return [];
  }
}

export function serializeWorkflowLibrary(workflows: WorkflowRecord[]): string {
  return JSON.stringify({ version: WORKFLOW_LIBRARY_VERSION, workflows }, null, 2);
}

export function upsertWorkflowRecord(
  workflows: WorkflowRecord[],
  record: WorkflowRecord,
  summary?: string,
): WorkflowRecord[] {
  const existing = workflows.find((item) => item.id === record.id);
  const updatedRecord = recordWorkflowRevision(
    record,
    summary || (existing ? 'Saved updates' : 'Created workflow'),
  );
  const next = workflows.filter((item) => item.id !== record.id);
  next.push(clone(updatedRecord));
  return next.sort((left, right) => left.name.localeCompare(right.name));
}

export function removeWorkflowRecord(workflows: WorkflowRecord[], id: string): WorkflowRecord[] {
  return workflows.filter((record) => record.id !== id);
}

/**
 * Move `draggedId` to the position of `overId` in an id-ordered list.
 * Returns a new array (unchanged if either id is missing or identical).
 */
export function reorderWorkflowIds(ids: string[], draggedId: string, overId: string): string[] {
  if (draggedId === overId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

export interface LibraryRow {
  id: string;
  name: string;
  isActive: boolean;
  isDirty: boolean;
  /** True when the workflow exists in the saved library (not just an open tab). */
  isSaved: boolean;
}

export interface TabDocumentSnapshot {
  id: string;
  name: string;
  dirty: boolean;
}

/**
 * Build the Workflows-sidebar rows from the saved library and any open
 * in-memory tab documents. Every id yields exactly one row — saved records win
 * over stashed tab snapshots, which win over the active-tab fallback — keeping
 * React keys unique even when the active unsaved tab has been stashed into
 * `tabDocumentsRef` (previously duplicated rows + `Encountered two children
 * with the same key` errors; Task 34).
 */
export function buildLibraryRows(
  records: WorkflowRecord[],
  tabDocuments: readonly TabDocumentSnapshot[],
  activeId: string,
  activeName: string,
  activeDirty: boolean,
  order: readonly string[],
): LibraryRow[] {
  const rowsById = new Map<string, LibraryRow>();

  records.forEach((record) => {
    rowsById.set(record.id, {
      id: record.id,
      name: record.name,
      isActive: record.id === activeId,
      isDirty: record.id === activeId && activeDirty,
      isSaved: true,
    });
  });

  tabDocuments.forEach((memory) => {
    if (rowsById.has(memory.id)) return;
    rowsById.set(memory.id, {
      id: memory.id,
      name: memory.name,
      isActive: memory.id === activeId,
      isDirty: memory.dirty,
      isSaved: false,
    });
  });

  if (!rowsById.has(activeId)) {
    rowsById.set(activeId, {
      id: activeId,
      name: activeName,
      isActive: true,
      isDirty: activeDirty,
      isSaved: false,
    });
  }

  // Respect the user's drag-reordered library order; unknown ids (new or
  // unsaved workflows) fall back to alphabetical after the known ones.
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...rowsById.values()].sort((a, b) => {
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex === undefined && bIndex === undefined) return a.name.localeCompare(b.name);
    if (aIndex === undefined) return 1;
    if (bIndex === undefined) return -1;
    return aIndex - bIndex;
  });
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
