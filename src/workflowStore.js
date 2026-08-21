export const WORKFLOW_LIBRARY_VERSION = 1;

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createWorkflowRecord({
  id,
  document,
  specification,
  format = 'yaml',
  positions = {},
  updatedAt = Date.now(),
}) {
  return {
    id,
    name: document?.document?.name || 'untitled-workflow',
    specification,
    format: format === 'json' ? 'json' : 'yaml',
    positions: clone(positions),
    updatedAt,
  };
}

export function parseWorkflowLibrary(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== WORKFLOW_LIBRARY_VERSION || !Array.isArray(parsed.workflows)) return [];
    return parsed.workflows
      .filter((record) => record && typeof record.id === 'string' && typeof record.specification === 'string')
      .map((record) => ({
        ...record,
        name: record.name || 'untitled-workflow',
        format: record.format === 'json' ? 'json' : 'yaml',
        positions: record.positions && typeof record.positions === 'object' ? record.positions : {},
      }));
  } catch {
    return [];
  }
}

export function serializeWorkflowLibrary(workflows) {
  return JSON.stringify({ version: WORKFLOW_LIBRARY_VERSION, workflows }, null, 2);
}

export function upsertWorkflowRecord(workflows, record) {
  const next = workflows.filter((item) => item.id !== record.id);
  next.push(clone(record));
  return next.sort((left, right) => left.name.localeCompare(right.name));
}

export function removeWorkflowRecord(workflows, id) {
  return workflows.filter((record) => record.id !== id);
}

export function uniqueWorkflowName(workflows, baseName) {
  const names = new Set(workflows.map((record) => record.name));
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) suffix += 1;
  return `${baseName}-${suffix}`;
}

export function createWorkflowPersistence(storage, key = 'open-workflow-editor:library') {
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

export function assertWorkflowPersistence(adapter) {
  const required = ['list', 'replace', 'clear'];
  const missing = required.filter((operation) => typeof adapter?.[operation] !== 'function');
  if (missing.length) throw new TypeError(`Workflow persistence is missing: ${missing.join(', ')}.`);
  return adapter;
}

export async function replaceWorkflowRecordsWithState(persistence, workflows, onState = () => {}) {
  onState({ status: 'saving', error: null });
  try {
    const result = await persistence.replace(workflows);
    onState({ status: 'saved', error: null });
    return result;
  } catch (error) {
    onState({ status: 'error', error });
    throw error;
  }
}
