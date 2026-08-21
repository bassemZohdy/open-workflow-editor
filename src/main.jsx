import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import {
  addTopLevelTask,
  autoLayoutFlow,
  connectTopLevelTasks,
  createFlowGraph,
  duplicateTopLevelTask,
  disconnectTopLevelTasks,
  getTopLevelTask,
  NEW_WORKFLOW,
  parseWorkflow,
  removeTopLevelTask,
  SAMPLE_WORKFLOW,
  SMART_CITY_WORKFLOWS,
  serializeWorkflow,
  updateTopLevelTaskConfig,
  updateTopLevelTaskField,
  updateTopLevelTaskName,
  validateGraph,
} from './workflowModel';
import {
  createWorkflowRecord,
  createWorkflowPersistence,
  assertWorkflowPersistence,
  parseWorkflowLibrary,
  replaceWorkflowRecordsWithState,
  removeWorkflowRecord,
  uniqueWorkflowName,
  upsertWorkflowRecord,
} from './workflowStore';
import { createHttpRuntimeAdapter } from './runtimeAdapter';
import { createDemoRuntimeAdapter } from './demoRuntime';
import { validateJavaScriptFunction } from './scriptContract';

const STORAGE_KEY = 'open-workflow-editor:dubai-government:v1';
const POSITIONS_KEY = 'open-workflow-editor:positions:v4';
const PREFERENCES_KEY = 'open-workflow-editor:preferences:v4';
const WORKFLOW_LIBRARY_KEY = 'open-workflow-editor:library:v4';
const PERSISTENCE_VERSION = 1;

function readStoredWorkflow() {
  const fallback = { specification: SAMPLE_WORKFLOW, format: 'yaml' };
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const record = JSON.parse(raw);
    if (record?.version === PERSISTENCE_VERSION && typeof record.specification === 'string') {
      return { specification: record.specification, format: record.format === 'json' ? 'json' : 'yaml' };
    }
  } catch {
    // Pre-versioned storage held the specification directly.
  }
  return { specification: raw, format: 'yaml' };
}

function createWorkflowId() {
  return typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readInitialWorkflowLibrary() {
  if (typeof window === 'undefined') return [];
  const saved = parseWorkflowLibrary(window.localStorage.getItem(WORKFLOW_LIBRARY_KEY));
  if (saved.length) return saved;

  const examples = SMART_CITY_WORKFLOWS.flatMap((example) => {
    try {
      const parsed = parseWorkflow(example.specification);
      return [
        createWorkflowRecord({
          id: example.id,
          document: parsed.document,
          specification: serializeWorkflow(parsed.document, 'yaml'),
          format: 'yaml',
          positions: {},
        }),
      ];
    } catch {
      return [];
    }
  });
  if (examples.length) return examples;

  const stored = readStoredWorkflow();
  let parsed;
  try {
    parsed = parseWorkflow(stored.specification || SAMPLE_WORKFLOW);
  } catch {
    parsed = parseWorkflow(SAMPLE_WORKFLOW);
  }
  let positions = {};
  try {
    positions = JSON.parse(window.localStorage.getItem(POSITIONS_KEY) || '{}');
  } catch {
    positions = {};
  }
  return [
    createWorkflowRecord({
      id: 'workflow-default',
      document: parsed.document,
      specification: serializeWorkflow(parsed.document, stored.format),
      format: stored.format,
      positions,
    }),
  ];
}

const paletteItems = [
  { type: 'set', label: 'Set value', description: 'Write data to context', icon: '↳', color: 'blue' },
  { type: 'call', label: 'Call HTTP', description: 'Invoke an HTTP endpoint', icon: '↗', color: 'violet' },
  { type: 'switch', label: 'Switch', description: 'Branch on a condition', icon: '◇', color: 'amber' },
  { type: 'do', label: 'Do group', description: 'Run nested tasks', icon: '≡', color: 'green' },
  { type: 'for', label: 'For each', description: 'Iterate over a collection', icon: '⟳', color: 'cyan' },
  { type: 'fork', label: 'Fork', description: 'Run branches concurrently', icon: '⑂', color: 'rose' },
  { type: 'emit', label: 'Emit event', description: 'Publish an event', icon: '✦', color: 'orange' },
  { type: 'listen', label: 'Listen', description: 'Wait for an event', icon: '◌', color: 'teal' },
  { type: 'raise', label: 'Raise error', description: 'Stop with an error', icon: '!', color: 'red' },
  {
    type: 'run',
    label: 'Run JavaScript',
    description: 'Execute in the Node sandbox',
    icon: 'JS',
    color: 'slate',
  },
  { type: 'try', label: 'Try / catch', description: 'Handle task failures', icon: '⊙', color: 'indigo' },
  { type: 'wait', label: 'Wait', description: 'Pause for a duration', icon: '◷', color: 'purple' },
];

const taskColors = {
  set: 'blue',
  call: 'violet',
  switch: 'amber',
  do: 'green',
  for: 'cyan',
  fork: 'rose',
  emit: 'orange',
  listen: 'teal',
  raise: 'red',
  run: 'slate',
  try: 'indigo',
  wait: 'purple',
};
const taskSubtitles = {
  set: 'Set values',
  call: 'HTTP call',
  switch: 'Conditional branch',
  do: 'Nested tasks',
  for: 'Collection loop',
  fork: 'Parallel branches',
  emit: 'Event emission',
  listen: 'Event listener',
  raise: 'Error handling',
  run: 'Node sandbox script',
  try: 'Try / catch',
  wait: 'Duration delay',
};

function formatError(error) {
  if (error?.schemaErrors?.length) {
    const formatted = error.schemaErrors
      .slice(0, 3)
      .map((item) => `${item.instancePath || '/'} — ${item.message}`)
      .join('\n');
    const unsupportedTask = error.schemaErrors.some(
      (item) =>
        /\/do\/\d+\//.test(item.instancePath || '') &&
        item.message === 'must match exactly one schema in oneOf',
    );
    return unsupportedTask ? `Unsupported task or structure:\n${formatted}` : formatted;
  }
  return error?.reason || error?.message || 'The workflow could not be parsed.';
}

function formatJsonInput(value, fallback = '{}') {
  if (value === undefined) return fallback;
  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? fallback : serialized;
}

function objectToPairs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    value: typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue),
  }));
}

function objectToCatalogEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, catalog]) => ({
    name,
    endpoint: typeof catalog?.endpoint === 'string' ? catalog.endpoint : '',
  }));
}

const JSON_BUILDER_TYPES = [
  ['string', 'Text'],
  ['number', 'Number'],
  ['boolean', 'True / false'],
  ['date', 'Date'],
  ['datetime', 'Date & time'],
  ['time', 'Time'],
  ['expression', 'Expression'],
  ['json', 'Object / array'],
  ['null', 'Null'],
];

function inferJsonBuilderType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return 'json';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' && /^\$\{[\s\S]*\}$/.test(value.trim())) return 'expression';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  if (typeof value === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return 'time';
  return 'string';
}

function normalizeJsonBuilderInput(type, value) {
  const text = String(value ?? '');
  if (type === 'datetime' && text.includes('T')) return text.slice(0, 16);
  if (type === 'date' && text.includes('T')) return text.slice(0, 10);
  if (type === 'time' && text.length > 5) return text.slice(0, 5);
  return text;
}

function objectToJsonBuilderEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    type: inferJsonBuilderType(entryValue),
    value:
      entryValue !== null && typeof entryValue === 'object'
        ? JSON.stringify(entryValue, null, 2)
        : entryValue === null
          ? ''
          : String(entryValue),
  }));
}

function jsonBuilderEntryValue(entry) {
  const value = String(entry.value ?? '');
  switch (entry.type) {
    case 'number':
      return value === '' ? 0 : Number(value);
    case 'boolean':
      return value === 'true';
    case 'date':
    case 'datetime':
    case 'time':
    case 'expression':
    case 'string':
      return value;
    case 'json':
      return JSON.parse(value || '{}');
    case 'null':
      return null;
    default:
      return value;
  }
}

function jsonBuilderEntriesToObject(entries) {
  return Object.fromEntries(
    entries.map((entry) => [entry.key.trim(), jsonBuilderEntryValue(entry)]).filter(([key]) => key),
  );
}

function JsonObjectBuilder({ label, entries, onChange, onCommit, addLabel = 'Add property' }) {
  const latestEntries = useRef(entries);
  useEffect(() => {
    latestEntries.current = entries;
  }, [entries]);

  const updateEntry = (index, field, value) => {
    const next = latestEntries.current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [field]: value } : entry,
    );
    latestEntries.current = next;
    onChange(next);
  };

  const changeType = (index, type) => {
    const current = latestEntries.current[index];
    const nextValue =
      type === 'boolean'
        ? 'false'
        : type === 'null'
          ? ''
          : normalizeJsonBuilderInput(type, current?.value || '');
    const next = entries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, type, value: nextValue } : entry,
    );
    latestEntries.current = next;
    onChange(next);
    try {
      onCommit(next);
    } catch {
      // Keep the field editable until the value is valid JSON.
    }
  };

  const commit = (nextEntries = latestEntries.current) => {
    try {
      onCommit(nextEntries);
    } catch {
      // The inspector owns the visible validation message.
    }
  };

  return (
    <div className="json-builder" aria-label={label}>
      <div className="json-builder-head">
        <span>Key</span>
        <span>Value</span>
        <span>Type</span>
        <span aria-hidden="true" />
      </div>
      {entries.length ? (
        entries.map((entry, index) => {
          const inputType =
            entry.type === 'date' || entry.type === 'datetime' || entry.type === 'time'
              ? entry.type === 'datetime'
                ? 'datetime-local'
                : entry.type
              : entry.type === 'number'
                ? 'number'
                : 'text';
          return (
            <div className="json-builder-row" key={`${label}-${index}`}>
              <input
                aria-label={`${label} ${index + 1} key`}
                placeholder="Key"
                value={entry.key}
                onChange={(event) => updateEntry(index, 'key', event.target.value)}
                onBlur={() => commit()}
              />
              {entry.type === 'boolean' ? (
                <select
                  aria-label={`${label} ${index + 1} value`}
                  data-ui-owner="native"
                  value={entry.value || 'false'}
                  onChange={(event) => {
                    updateEntry(index, 'value', event.target.value);
                    commit(
                      entries.map((current, entryIndex) =>
                        entryIndex === index ? { ...current, value: event.target.value } : current,
                      ),
                    );
                  }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : entry.type === 'null' ? (
                <span className="json-builder-null">null</span>
              ) : entry.type === 'json' ? (
                <textarea
                  aria-label={`${label} ${index + 1} value`}
                  className="resize-none"
                  placeholder="{} or []"
                  value={entry.value}
                  onChange={(event) => updateEntry(index, 'value', event.target.value)}
                  onBlur={() => commit()}
                  spellCheck="false"
                />
              ) : (
                <input
                  aria-label={`${label} ${index + 1} value`}
                  type={inputType}
                  step={entry.type === 'number' ? 'any' : undefined}
                  placeholder={entry.type === 'expression' ? '${ $context.value }' : 'Value'}
                  value={entry.value}
                  onChange={(event) => updateEntry(index, 'value', event.target.value)}
                  onBlur={() => commit()}
                />
              )}
              <select
                aria-label={`${label} ${index + 1} type`}
                data-ui-owner="native"
                value={entry.type}
                onChange={(event) => changeType(index, event.target.value)}
              >
                {JSON_BUILDER_TYPES.map(([value, text]) => (
                  <option value={value} key={value}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pair-remove"
                aria-label={`Remove ${label} ${index + 1}`}
                onClick={() => {
                  const next = entries.filter((_, entryIndex) => entryIndex !== index);
                  onChange(next);
                  commit(next);
                }}
              >
                ×
              </button>
            </div>
          );
        })
      ) : (
        <p className="pair-empty">No properties yet.</p>
      )}
      <button
        type="button"
        className="pair-add"
        onClick={() => onChange([...entries, { key: '', type: 'string', value: '' }])}
      >
        ＋ {addLabel}
      </button>
    </div>
  );
}

function durationParts(value) {
  const match = String(value || '').match(
    /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/,
  );
  if (match) {
    if (match[1]) return { amount: match[1], unit: 'H' };
    if (match[2]) return { amount: match[2], unit: 'M' };
    if (match[3]) return { amount: match[3], unit: 'S' };
  }
  const days = String(value || '').match(/^P(\d+(?:\.\d+)?)D$/);
  return days ? { amount: days[1], unit: 'D' } : { amount: '', unit: 'S' };
}

function durationValue(amount, unit) {
  if (!amount) return '';
  return unit === 'D' ? `P${amount}D` : `PT${amount}${unit}`;
}

function DurationField({ label, value, onChange }) {
  const parts = durationParts(value);
  return (
    <div className="field duration-field">
      <span>{label}</span>
      <div className="duration-controls">
        <input
          aria-label={`${label} amount`}
          type="number"
          min="0"
          step="any"
          value={parts.amount}
          placeholder="5"
          onChange={(event) => onChange(durationValue(event.target.value, parts.unit))}
        />
        <select
          aria-label={`${label} unit`}
          data-ui-owner="native"
          value={parts.unit}
          onChange={(event) => onChange(durationValue(parts.amount, event.target.value))}
        >
          <option value="S">Seconds</option>
          <option value="M">Minutes</option>
          <option value="H">Hours</option>
          <option value="D">Days</option>
        </select>
      </div>
      <small className="field-help">Stored as ISO 8601 duration{value ? ` · ${value}` : ''}</small>
    </div>
  );
}

function pairsToObject(pairs) {
  return Object.fromEntries(pairs.map(({ key, value }) => [key.trim(), value]).filter(([key]) => key));
}

function KeyValuePairs({ label, addLabel, pairs, onChange, onCommit }) {
  const latestPairs = useRef(pairs);
  useEffect(() => {
    latestPairs.current = pairs;
  }, [pairs]);

  const updatePair = (index, field, value) => {
    const nextPairs = latestPairs.current.map((pair, pairIndex) =>
      pairIndex === index ? { ...pair, [field]: value } : pair,
    );
    latestPairs.current = nextPairs;
    onChange(nextPairs);
  };

  return (
    <div className="pair-editor" aria-label={label}>
      {pairs.length ? (
        pairs.map((pair, index) => (
          <div className="pair-row" key={`${label}-${index}`}>
            <input
              aria-label={`${label} ${index + 1} name`}
              placeholder="Name"
              value={pair.key}
              onChange={(event) => updatePair(index, 'key', event.target.value)}
              onBlur={() => onCommit(latestPairs.current)}
            />
            <input
              aria-label={`${label} ${index + 1} value`}
              placeholder="Value"
              value={pair.value}
              onChange={(event) => updatePair(index, 'value', event.target.value)}
              onBlur={() => onCommit(latestPairs.current)}
            />
            <button
              type="button"
              className="pair-remove"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => {
                const nextPairs = pairs.filter((_, pairIndex) => pairIndex !== index);
                onChange(nextPairs);
                onCommit(nextPairs);
              }}
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <p className="pair-empty">No entries yet.</p>
      )}
      <button type="button" className="pair-add" onClick={() => onChange([...pairs, { key: '', value: '' }])}>
        ＋ {addLabel}
      </button>
    </div>
  );
}

function formatGraphIssues(document) {
  const issues = validateGraph(document);
  return issues.length ? issues.map((issue) => `${issue.path} — ${issue.message}`).join('\n') : '';
}

function validationTitle(message) {
  if (/must match|unevaluated|unsupported|unknown task/i.test(message))
    return 'Unsupported task or structure';
  if (/yaml|mapping|parse|unexpected|flow sequence|flow mapping/i.test(message))
    return 'Could not parse specification';
  return 'Specification needs attention';
}

function runtimeRunId(result) {
  return result?.runId || result?.id || result?.instanceId || result?.workflowInstanceId || '';
}

function runtimeState(result) {
  return String(result?.status || result?.state || result?.phase || 'unknown').toLowerCase();
}

function isTerminalRuntimeState(state) {
  return ['completed', 'complete', 'failed', 'failure', 'error', 'aborted', 'cancelled', 'canceled'].includes(
    state,
  );
}

function isActiveRuntimeState(state) {
  return ['queued', 'pending', 'starting', 'running', 'in_progress', 'in-progress'].includes(state);
}

function formatRuntimeDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function runtimeLogCount(logs) {
  return logs ? logs.split('\n').filter(Boolean).length : 0;
}

function parseRuntimeLogs(logs) {
  return String(logs || '')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      const timestamp = match?.[1] || '';
      const message = match?.[2] || line;
      const separator = message.indexOf(' · ');
      return {
        id: `${timestamp}-${index}`,
        timestamp,
        summary: separator > -1 ? message.slice(0, separator) : message,
        detail: separator > -1 ? message.slice(separator + 3) : '',
        raw: line,
      };
    });
}

async function executeNodeSandboxScript(payload) {
  const response = await fetch('/api/sandbox/javascript', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Node sandbox failed (${response.status}).`);
  }
  return result.result;
}

function RuntimeLogList({ logs }) {
  const entries = useMemo(() => parseRuntimeLogs(logs), [logs]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded(new Set(entries.length ? [entries.length - 1] : []));
  }, [entries.length, logs]);

  const toggleEntry = (index, open) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const setAllExpanded = (open) => {
    setExpanded(open ? new Set(entries.map((_, index) => index)) : new Set());
  };

  return (
    <div className="runtime-log-list" aria-label="Workflow run logs">
      <div className="runtime-log-actions">
        <button type="button" className="log-action" onClick={() => setAllExpanded(true)}>
          Expand all
        </button>
        <button type="button" className="log-action" onClick={() => setAllExpanded(false)}>
          Collapse all
        </button>
      </div>
      <div className="runtime-log-entries">
        {entries.map((entry, index) => (
          <details
            className="runtime-log-entry"
            key={entry.id}
            open={expanded.has(index)}
            onToggle={(event) => toggleEntry(index, event.currentTarget.open)}
          >
            <summary>
              <i aria-hidden="true" />
              <time>{entry.timestamp ? entry.timestamp.slice(11, 19) : '—'}</time>
              <strong>{entry.summary}</strong>
              <span aria-hidden="true">{expanded.has(index) ? '⌃' : '⌄'}</span>
            </summary>
            <div className="runtime-log-detail">
              {entry.detail && <p>{entry.detail}</p>}
              <code>{entry.raw}</code>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function RuntimePanel({ document, side = false, open, onOpenChange }) {
  const [demoDelay, setDemoDelay] = useState(500);
  const demoRuntime = useMemo(
    () => createDemoRuntimeAdapter({ stepDelay: demoDelay, executeScript: executeNodeSandboxScript }),
    [demoDelay],
  );
  const gatewayRuntime = useMemo(() => {
    const gatewayUrl = import.meta.env.VITE_RUNTIME_GATEWAY_URL?.trim();
    if (!gatewayUrl) return null;
    try {
      return createHttpRuntimeAdapter({ baseUrl: gatewayUrl });
    } catch (error) {
      return { configurationError: error };
    }
  }, []);
  const [runtimeMode, setRuntimeMode] = useState('demo');
  const [inputs, setInputs] = useState('{\n  "nolTagId": "0123456789",\n  "channel": "nol-pay"\n}');
  const [runId, setRunId] = useState('');
  const [runStatus, setRunStatus] = useState(null);
  const [runLogs, setRunLogs] = useState('');
  const [runError, setRunError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [internalOpen, setInternalOpen] = useState(side);
  const isOpen = open ?? internalOpen;
  const runtime = runtimeMode === 'demo' ? demoRuntime : gatewayRuntime;
  const gatewayAvailable = Boolean(gatewayRuntime && !gatewayRuntime.configurationError);

  const resetRun = useCallback(() => {
    setRunId('');
    setRunStatus(null);
    setRunLogs('');
    setRunError('');
  }, []);

  const changeRuntimeMode = (mode) => {
    setRuntimeMode(mode);
    resetRun();
  };

  const changeDemoDelay = (event) => {
    setDemoDelay(Number(event.target.value));
    resetRun();
  };

  const refreshRun = useCallback(async () => {
    if (!runId || !runtime || runtime.configurationError) return;
    try {
      const [status, logs] = await Promise.all([runtime.status(runId), runtime.logs(runId)]);
      setRunStatus(status);
      setRunLogs(typeof logs === 'string' ? logs : JSON.stringify(logs, null, 2));
      setRunError('');
    } catch (error) {
      setRunError(error.message || 'Could not refresh the workflow run.');
    }
  }, [runId, runtime]);

  useEffect(() => {
    if (!runId || !runtime || runtime.configurationError || isTerminalRuntimeState(runtimeState(runStatus)))
      return;
    const pollInterval = runtimeMode === 'demo' ? Math.max(250, demoDelay) : 1500;
    const timer = window.setInterval(refreshRun, pollInterval);
    return () => window.clearInterval(timer);
  }, [demoDelay, refreshRun, runId, runStatus, runtime, runtimeMode]);

  const startRun = async () => {
    if (!runtime || runtime.configurationError) return;
    let parsedInputs;
    try {
      parsedInputs = JSON.parse(inputs || '{}');
    } catch {
      setRunError('Run inputs must be valid JSON.');
      return;
    }
    setIsStarting(true);
    setRunError('');
    try {
      const result = await runtime.start(document, parsedInputs);
      const nextRunId = runtimeRunId(result);
      if (!nextRunId) throw new Error('Runtime did not return a run identifier.');
      setRunId(String(nextRunId));
      setRunStatus(result);
      setRunLogs('');
    } catch (error) {
      setRunError(error.message || 'Could not start the workflow.');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelRun = async () => {
    if (!runId || !runtime || runtime.configurationError) return;
    try {
      await runtime.cancel(runId);
      await refreshRun();
    } catch (error) {
      setRunError(error.message || 'Could not cancel the workflow run.');
    }
  };

  const taskProgress = runStatus?.tasks || runStatus?.taskProgress || runStatus?.steps || [];
  const progressItems = Array.isArray(taskProgress)
    ? taskProgress
    : Object.entries(taskProgress || {}).map(([name, value]) => ({ name, ...value }));
  const failureValue = runStatus?.failures || runStatus?.failure;
  const failureItems = Array.isArray(failureValue) ? failureValue : failureValue ? [failureValue] : [];
  const retryCount = runStatus?.retries ?? runStatus?.retryCount;
  const status = runtimeState(runStatus);
  const completedCount = progressItems.filter((item) =>
    ['completed', 'complete'].includes(String(item.status || item.state).toLowerCase()),
  ).length;
  const activeTask =
    runStatus?.activeTask ||
    progressItems.find((item) =>
      ['running', 'active'].includes(String(item.status || item.state).toLowerCase()),
    );
  const elapsedMs =
    runStatus?.durationMs ??
    (runStatus?.startedAt ? Date.now() - new Date(runStatus.startedAt).getTime() : undefined);

  const toggleOpen = () => {
    const nextOpen = !isOpen;
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <section
      className={`runtime-panel ${side ? 'side-runtime-panel' : ''} ${!isOpen ? 'runtime-panel-collapsed' : ''}`}
      data-runtime-open={isOpen ? 'true' : 'false'}
    >
      <div className="runtime-panel-head">
        <span className="runtime-summary-title">
          <i className={`runtime-dot ${runtime && !runtime.configurationError ? 'connected' : ''}`} />
          Runtime
          <b className={`runtime-mode-badge ${runtimeMode}`}>{runtimeMode === 'demo' ? 'DEMO' : 'GATEWAY'}</b>
        </span>
        <span className="runtime-summary-meta">
          <small>
            {runtimeMode === 'demo'
              ? runId
                ? `Run ${runId}`
                : 'Local simulation ready'
              : !runtime
                ? 'Gateway not configured'
                : runtime.configurationError
                  ? 'Invalid gateway configuration'
                  : runId
                    ? `Run ${runId}`
                    : 'Ready to validate'}
          </small>
          <b className="runtime-summary-chevron" aria-hidden="true">
            {isOpen ? '⌄' : '›'}
          </b>
        </span>
        <button
          type="button"
          className="panel-collapse-button runtime-collapse-button"
          onClick={toggleOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} Runtime`}
          title={`${isOpen ? 'Collapse' : 'Expand'} Runtime`}
        >
          {isOpen ? '›' : '‹'}
        </button>
      </div>
      {isOpen && (
        <div className="runtime-panel-body">
          <div className="runtime-mode-switch" role="tablist" aria-label="Runtime mode">
            <button
              className={runtimeMode === 'demo' ? 'active' : ''}
              onClick={() => changeRuntimeMode('demo')}
              role="tab"
              aria-selected={runtimeMode === 'demo'}
            >
              Demo engine
            </button>
            <button
              className={runtimeMode === 'gateway' ? 'active' : ''}
              onClick={() => changeRuntimeMode('gateway')}
              role="tab"
              aria-selected={runtimeMode === 'gateway'}
              title={
                gatewayAvailable
                  ? 'Use the configured runtime gateway'
                  : 'Configure VITE_RUNTIME_GATEWAY_URL first'
              }
            >
              Runtime gateway
            </button>
          </div>
          {runtimeMode === 'demo' && (
            <div className="runtime-demo-note">
              <div>
                <strong>Local demo engine</strong>
                <span>
                  Simulates scheduler and event triggers, task progress, service calls, waits, failures, and
                  logs in this browser. JavaScript tasks run through the local Node sandbox endpoint.
                </span>
              </div>
              <label className="runtime-pace-control">
                <span>Demo pace</span>
                <select data-ui-owner="native" value={demoDelay} onChange={changeDemoDelay}>
                  <option value="250">Fast</option>
                  <option value="500">Steady</option>
                  <option value="900">Slow</option>
                </select>
              </label>
            </div>
          )}
          {runtimeMode === 'gateway' && (!runtime || runtime.configurationError) ? (
            <div className="runtime-empty" role="status">
              <strong>No runtime gateway connected</strong>
              <p>
                Set the public VITE_RUNTIME_GATEWAY_URL and deploy the server-side gateway before running
                workflows.
              </p>
            </div>
          ) : runtime ? (
            <>
              <label className="runtime-input field">
                <span>
                  Run inputs <small>JSON</small>
                </span>
                <textarea
                  className="resize-none"
                  value={inputs}
                  onChange={(event) => setInputs(event.target.value)}
                  spellCheck="false"
                />
              </label>
              <div className="runtime-controls">
                <button className="button primary" onClick={startRun} disabled={isStarting}>
                  {isStarting ? 'Starting…' : 'Start run'}
                </button>
                {runId && isActiveRuntimeState(status) && (
                  <button className="button secondary danger-action" onClick={cancelRun}>
                    Cancel run
                  </button>
                )}
                {runId && (
                  <button className="button secondary" onClick={refreshRun}>
                    Refresh status
                  </button>
                )}
              </div>
              <p className="runtime-action-help">
                <span>
                  <strong>Start run</strong> executes the workflow in the selected engine. Cancel and Refresh
                  status apply to the active run.
                </span>
              </p>
              <div className={`runtime-status runtime-status-${status}`} role="status" aria-live="polite">
                <div className="runtime-status-main">
                  <span>Status</span>
                  <strong>{runId ? status : 'not started'}</strong>
                </div>
                {runId && (
                  <div className="runtime-status-meta">
                    <span>{completedCount} done</span>
                    <span>{formatRuntimeDuration(elapsedMs)}</span>
                    <code>{runId}</code>
                  </div>
                )}
              </div>
              {runError && (
                <div className="runtime-error" role="alert">
                  {runError}
                </div>
              )}
              {progressItems.length > 0 && (
                <div className="runtime-progress">
                  <div className="runtime-section-head">
                    <strong>Task timeline</strong>
                    <small>
                      {completedCount}/{progressItems.length} complete
                    </small>
                  </div>
                  {progressItems.map((item, index) => {
                    const itemStatus = String(item.status || item.state || 'unknown').toLowerCase();
                    const itemName = item.name || item.task || item.id || `Task ${index + 1}`;
                    return (
                      <div
                        className={`runtime-progress-item runtime-progress-${itemStatus}`}
                        key={item.id || item.name || index}
                      >
                        <i aria-hidden="true" />
                        <span>
                          <b>{itemName}</b>
                          <small>
                            {item.type || 'task'}
                            {item.durationMs !== undefined
                              ? ` · ${formatRuntimeDuration(item.durationMs)}`
                              : ''}
                          </small>
                        </span>
                        <small className="runtime-progress-state">{itemStatus}</small>
                      </div>
                    );
                  })}
                </div>
              )}
              {runId && (
                <div className="runtime-live-activity" role="status" aria-live="polite">
                  <i className={activeTask ? 'active' : ''} aria-hidden="true" />
                  <span>
                    <b>{activeTask ? `Running ${activeTask.name}` : `Run ${status}`}</b>
                    <small>
                      {activeTask ? `${activeTask.type || 'task'} · live activity` : 'No active task'}
                    </small>
                  </span>
                  <time>{formatRuntimeDuration(elapsedMs)}</time>
                </div>
              )}
              {(failureItems.length > 0 || retryCount !== undefined) && (
                <div className="runtime-outcomes">
                  {failureItems.length > 0 && (
                    <div className="runtime-failures">
                      <strong>Failures</strong>
                      {failureItems.map((failure, index) => (
                        <span key={index}>
                          {typeof failure === 'string' ? failure : JSON.stringify(failure)}
                        </span>
                      ))}
                    </div>
                  )}
                  {retryCount !== undefined && (
                    <div className="runtime-retries">
                      <strong>Retries</strong>
                      <span>{retryCount}</span>
                    </div>
                  )}
                </div>
              )}
              {runLogs && (
                <div className="runtime-log-section">
                  <div className="runtime-section-head">
                    <strong>Execution log</strong>
                    <small>{runtimeLogCount(runLogs)} events</small>
                  </div>
                  <RuntimeLogList logs={runLogs} />
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WorkflowNode({ data, selected }) {
  const color = taskColors[data.taskType] || 'blue';
  return (
    <div
      className={`workflow-node ${color} ${selected ? 'selected' : ''}`}
      role="group"
      aria-label={`${data.taskType} task ${data.label}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-accent" />
      <div className="node-icon">{paletteItems.find((item) => item.type === data.taskType)?.icon || '◇'}</div>
      <div className="node-content">
        <strong>{data.label}</strong>
        <span>{taskSubtitles[data.taskType] || data.taskType}</span>
      </div>
      <span className="node-menu">···</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function PortNode({ data }) {
  const isStart = data.portType === 'start';
  return (
    <div className={`port-node ${isStart ? 'start' : 'end'}`}>
      {isStart && <Handle type="source" position={Position.Bottom} />}
      {!isStart && <Handle type="target" position={Position.Top} />}
      <span>{isStart ? '▶' : '■'}</span>
      <strong>{data.label}</strong>
    </div>
  );
}

const nodeTypes = { task: WorkflowNode, port: PortNode };

function EditorCanvas({
  document,
  nodes,
  setNodes,
  edges,
  setEdges,
  setPositions,
  setDirty,
  onDocumentChange,
  onPositionChange,
  setSelectedId,
  selectedId,
  layoutMode,
  onUndo,
  onRedo,
  onSave,
  onDuplicateSelected,
  layoutKey,
}) {
  const reactFlow = useReactFlow();
  const [dropStatus, setDropStatus] = useState('idle');

  useEffect(() => {
    if (!nodes.length) return undefined;
    const frame = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.2, duration: 0 });
    });
    const timer = window.setTimeout(() => {
      reactFlow.fitView({ padding: 0.18, duration: 0 });
    }, 140);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [layoutKey, nodes.length, reactFlow]);

  const onNodesChange = useCallback(
    (changes) => {
      const moved = changes.filter((change) => change.type === 'position' && change.position);
      if (moved.length) {
        setDirty(true);
        setPositions((current) => {
          const next = { ...current };
          moved.forEach((change) => {
            next[change.id] = change.position;
          });
          return next;
        });
      }
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [setNodes, setPositions],
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
    [setEdges],
  );

  const onConnect = useCallback(
    (connection) => {
      const next = connectTopLevelTasks(document, connection.source, connection.target);
      if (next !== document) onDocumentChange(next);
    },
    [document, onDocumentChange],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges) => {
      deletedEdges.forEach((edge) => {
        const next = disconnectTopLevelTasks(document, edge.source, edge.target);
        if (next !== document) onDocumentChange(next);
      });
    },
    [document, onDocumentChange],
  );

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      const taskNodes = deletedNodes.filter((node) => node.type === 'task');
      if (!taskNodes.length) return;
      let next = document;
      taskNodes.forEach((node) => {
        next = removeTopLevelTask(next, node.id);
      });
      onDocumentChange(next);
      setSelectedId(null);
    },
    [document, onDocumentChange, setSelectedId],
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDropStatus('idle');
      const taskType = event.dataTransfer.getData('application/open-workflow-task');
      if (!taskType || !paletteItems.some((item) => item.type === taskType)) {
        setDropStatus('invalid');
        window.setTimeout(() => setDropStatus('idle'), 1200);
        return;
      }
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const next = addTopLevelTask(document, taskType);
      const createdName = Object.keys(next.do[next.do.length - 1])[0];
      onDocumentChange(next, { [`/do/${createdName}`]: position });
    },
    [document, onDocumentChange, reactFlow],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const modifier = event.metaKey || event.ctrlKey;
      if (isTyping && !(modifier && event.key.toLowerCase() === 's')) return;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? onRedo() : onUndo();
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      } else if (modifier && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        onDuplicateSelected();
      } else if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const taskNodes = nodes.filter((node) => node.type === 'task');
        setNodes((current) => current.map((node) => ({ ...node, selected: node.type === 'task' })));
        setSelectedId(taskNodes[0]?.id || null);
      } else if (!modifier && (event.key === 'Delete' || event.key === 'Backspace')) {
        const selectedNodes = nodes.filter((node) => node.type === 'task' && node.selected);
        if (selectedNodes.length) {
          event.preventDefault();
          reactFlow.deleteElements({ nodes: selectedNodes });
        }
      } else if (!modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        reactFlow.fitView({ padding: 0.18, duration: 240 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, onDuplicateSelected, onRedo, onSave, onUndo, reactFlow, selectedId, setNodes, setSelectedId]);

  return (
    <div
      className={`canvas-shell ${dropStatus !== 'idle' ? 'drag-over' : ''}`}
      onDrop={onDrop}
      onDragEnter={(event) => {
        setDropStatus(
          event.dataTransfer.types.includes('application/open-workflow-task') ? 'valid' : 'invalid',
        );
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget))
          setDropStatus('idle');
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const valid = event.dataTransfer.types.includes('application/open-workflow-task');
        event.dataTransfer.dropEffect = valid ? 'move' : 'none';
        setDropStatus(valid ? 'valid' : 'invalid');
      }}
    >
      {dropStatus !== 'idle' && (
        <div className={`drop-target ${dropStatus}`}>
          <strong>{dropStatus === 'valid' ? 'Drop task here' : 'Unsupported drop'}</strong>
          <span>
            {dropStatus === 'valid' ? 'Release to add it to the workflow' : 'Use a task from the palette'}
          </span>
        </div>
      )}
      {nodes.length <= 2 && (
        <div className="canvas-empty">
          <span className="empty-mark">＋</span>
          <strong>Drop a task here</strong>
          <p>Drag a task from the palette to start building this workflow.</p>
        </div>
      )}
      <details className="canvas-legend">
        <summary>Legend</summary>
        <div className="legend-items">
          {paletteItems.map((item) => (
            <span key={item.type} className={`legend-item ${item.color}`}>
              <i>{item.icon}</i>
              {item.label}
            </span>
          ))}
          <span className="legend-item state">
            <i className="legend-selected" />
            selected
          </span>
        </div>
      </details>
      <ReactFlow
        key={layoutKey}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => onPositionChange(node.id, node.position)}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onNodeClick={(_, node) => setSelectedId(node.type === 'task' ? node.id : null)}
        onPaneClick={() => setSelectedId(null)}
        deleteKeyCode="Delete"
        selectionOnDrag
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesConnectable
        nodesDraggable={layoutMode === 'manual'}
        elementsSelectable
        panOnDrag
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#c9d1dc" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) =>
            node.type === 'port' ? '#98a4b7' : node.data?.taskType === 'call' ? '#9370df' : '#4c83e7'
          }
          maskColor="#f8fafccc"
        />
      </ReactFlow>
    </div>
  );
}

function Palette({ onNewWorkflow, onAddTask, collapsed = false, onToggle }) {
  const beginDrag = (event, type) => {
    event.dataTransfer.setData('application/open-workflow-task', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  if (collapsed) {
    return (
      <aside className="left-rail left-rail-collapsed" aria-label="Collapsed task palette">
        <button
          className="rail-expand-button"
          onClick={onToggle}
          aria-label="Expand task palette"
          title="Expand task palette"
        >
          ›
        </button>
        <span className="collapsed-rail-label">Task palette</span>
      </aside>
    );
  }

  return (
    <aside className="left-rail" aria-label="Task palette">
      <div className="rail-header">
        <div>
          <span className="section-kicker">Build</span>
          <h1>
            Open Workflow <span>Editor</span>
          </h1>
        </div>
        <div className="rail-header-actions">
          <button
            className="rail-collapse-button"
            onClick={onToggle}
            aria-label="Collapse task palette"
            title="Collapse task palette"
          >
            ‹
          </button>
          <button
            className="new-workflow"
            onClick={onNewWorkflow}
            aria-label="Create new workflow"
            title="Create new workflow"
          >
            ＋
          </button>
        </div>
      </div>
      <div className="rail-section">
        <div className="section-heading">
          <strong>Task palette</strong>
          <span>Drag to canvas</span>
        </div>
        <div className="palette-list">
          {paletteItems.map((item) => (
            <div
              key={item.type}
              className={`palette-item ${item.color}`}
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Add ${item.label} task`}
              onDragStart={(event) => beginDrag(event, item.type)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onAddTask(item.type);
                }
              }}
            >
              <span className="palette-icon">{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <b>⠿</b>
            </div>
          ))}
        </div>
        <div className="palette-note">
          <span>✦</span>
          <p>More task types are coming. Start with the core building blocks.</p>
        </div>
      </div>
      <div className="rail-footer">
        <span className="status-led" />
        Open Workflow DSL <strong>1.0.3</strong>
        <span className="rail-spacer" />
        <span className="version">local</span>
      </div>
    </aside>
  );
}

function readSwitchCases(task) {
  return (Array.isArray(task?.switch) ? task.switch : []).flatMap((entry) => {
    const [name, definition] = Object.entries(entry || {})[0] || [];
    return name ? [{ name, definition: { ...(definition || {}) } }] : [];
  });
}

function normalizeSwitchCases(cases) {
  const usedNames = new Set();
  return cases.map((item, index) => {
    const baseName = String(item.name || `case${index + 1}`).trim() || `case${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(name)) name = `${baseName}-${suffix++}`;
    usedNames.add(name);
    const definition = { ...(item.definition || {}) };
    if (!definition.when) definition.when = '${ true }';
    if (!definition.then) delete definition.then;
    return { name, definition };
  });
}

function Inspector({ selected, document, onDocumentChange, onRequestDelete, collapsed = false, onToggle }) {
  const [name, setName] = useState(selected?.name || '');
  const [config, setConfig] = useState(selected ? JSON.stringify(selected.task, null, 2) : '');
  const [setValue, setSetValue] = useState('');
  const [method, setMethod] = useState('get');
  const [endpoint, setEndpoint] = useState('');
  const [callHeaders, setCallHeaders] = useState([]);
  const [callQuery, setCallQuery] = useState([]);
  const [callBodyEntries, setCallBodyEntries] = useState([]);
  const [callOutput, setCallOutput] = useState('content');
  const [callRedirect, setCallRedirect] = useState(false);
  const [switchCases, setSwitchCases] = useState([]);
  const [duration, setDuration] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDataEntries, setEventDataEntries] = useState([]);
  const [scriptCode, setScriptCode] = useState('');
  const [runMode, setRunMode] = useState('javascript');
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [subflowNamespace, setSubflowNamespace] = useState('dubai-government');
  const [subflowName, setSubflowName] = useState('shared-renewal-notification');
  const [subflowVersion, setSubflowVersion] = useState('1.0.0');
  const [subflowInputEntries, setSubflowInputEntries] = useState([]);
  const [errorType, setErrorType] = useState('');
  const [errorStatus, setErrorStatus] = useState('');
  const [errorData, setErrorData] = useState('');
  const [condition, setCondition] = useState('');
  const [inputEntries, setInputEntries] = useState([]);
  const [outputEntries, setOutputEntries] = useState([]);
  const [exportEntries, setExportEntries] = useState([]);
  const [timeoutValue, setTimeoutValue] = useState('');
  const [metadataEntries, setMetadataEntries] = useState([]);
  const [nestedTasks, setNestedTasks] = useState('[]');
  const [fieldError, setFieldError] = useState('');
  const selectedSignature = selected
    ? JSON.stringify({ name: selected.name, type: selected.type, task: selected.task })
    : '';

  useEffect(() => {
    setName(selected?.name || '');
    setConfig(selected ? JSON.stringify(selected.task, null, 2) : '');
    setSetValue(
      selected?.type === 'set'
        ? typeof selected.task.set === 'object'
          ? (selected.task.set.value ?? '')
          : (selected.task.set ?? '')
        : '',
    );
    setMethod(selected?.type === 'call' ? selected.task.with?.method || 'get' : 'get');
    setEndpoint(selected?.type === 'call' ? selected.task.with?.endpoint || '' : '');
    setCallHeaders(selected?.type === 'call' ? objectToPairs(selected.task.with?.headers) : []);
    setCallQuery(selected?.type === 'call' ? objectToPairs(selected.task.with?.query) : []);
    setCallBodyEntries(selected?.type === 'call' ? objectToJsonBuilderEntries(selected.task.with?.body) : []);
    setCallOutput(selected?.type === 'call' ? selected.task.with?.output || 'content' : 'content');
    setCallRedirect(selected?.type === 'call' ? Boolean(selected.task.with?.redirect) : false);
    setSwitchCases(selected?.type === 'switch' ? readSwitchCases(selected.task) : []);
    setDuration(
      selected?.type === 'wait' ? (typeof selected.task.wait === 'string' ? selected.task.wait : '') : '',
    );
    setEventType(selected?.type === 'emit' ? selected.task.emit?.event?.with?.type || '' : '');
    setEventDataEntries(
      selected?.type === 'emit' ? objectToJsonBuilderEntries(selected.task.emit?.event?.with?.data) : [],
    );
    setScriptCode(selected?.type === 'run' ? selected.task.run?.script?.code || '' : '');
    setRunMode(selected?.type === 'run' && selected.task.run?.workflow ? 'subflow' : 'javascript');
    setSubflowNamespace(selected?.task.run?.workflow?.namespace || 'dubai-government');
    setSubflowName(selected?.task.run?.workflow?.name || 'shared-renewal-notification');
    setSubflowVersion(selected?.task.run?.workflow?.version || '1.0.0');
    setSubflowInputEntries(objectToJsonBuilderEntries(selected?.task.run?.workflow?.input));
    setErrorType(selected?.type === 'raise' ? selected.task.raise?.error?.type || '' : '');
    setErrorStatus(selected?.type === 'raise' ? String(selected.task.raise?.error?.status ?? '') : '');
    setErrorData(selected?.type === 'raise' ? selected.task.raise?.error?.detail || '' : '');
    setCondition(selected?.task.if || '');
    setInputEntries(objectToJsonBuilderEntries(selected?.task.input));
    setOutputEntries(objectToJsonBuilderEntries(selected?.task.output));
    setExportEntries(objectToJsonBuilderEntries(selected?.task.export));
    setTimeoutValue(
      typeof selected?.task.timeout === 'string'
        ? selected.task.timeout
        : formatJsonInput(selected?.task.timeout, ''),
    );
    setMetadataEntries(objectToJsonBuilderEntries(selected?.task.metadata));
    setNestedTasks(selected?.type === 'do' ? JSON.stringify(selected.task.do || [], null, 2) : '[]');
    setFieldError('');
  }, [selectedSignature]);

  const catalogSignature = JSON.stringify(document?.use?.catalogs || {});
  useEffect(() => {
    setCatalogEntries(objectToCatalogEntries(document?.use?.catalogs));
  }, [catalogSignature]);

  if (!selected)
    return (
      <aside className={`inspector ${collapsed ? 'inspector-collapsed' : ''}`}>
        <div className="inspector-head">
          <div>
            <span className="section-kicker">Inspector</span>
            <h2>Task properties</h2>
          </div>
          <button
            className="panel-collapse-button"
            onClick={onToggle}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
            title={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
          >
            {collapsed ? '‹' : '›'}
          </button>
        </div>
        <div className="inspector-empty">
          <span>◇</span>
          <strong>Select a task</strong>
          <p>Choose a node on the canvas to edit its properties.</p>
        </div>
      </aside>
    );

  const applyConfig = () => {
    try {
      onDocumentChange(updateTopLevelTaskConfig(document, `/do/${selected.name}`, JSON.parse(config)));
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyField = (path, value) => {
    try {
      onDocumentChange(updateTopLevelTaskField(document, `/do/${selected.name}`, path, value));
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyScriptCode = () => {
    const result = validateJavaScriptFunction(scriptCode);
    if (!result.valid) {
      setFieldError(result.message);
      return;
    }
    applyField(['run', 'script', 'code'], scriptCode);
  };

  const applyCatalogEntries = (entries) => {
    const catalogs = Object.fromEntries(
      entries
        .map(({ name, endpoint }) => [name.trim(), { endpoint: endpoint.trim() }])
        .filter(([name, catalog]) => name && catalog.endpoint),
    );
    const next = JSON.parse(JSON.stringify(document));
    next.use = { ...(next.use || {}) };
    if (Object.keys(catalogs).length) next.use.catalogs = catalogs;
    else delete next.use.catalogs;
    if (!Object.keys(next.use).length) delete next.use;
    onDocumentChange(next);
  };

  const applySubflow = (input = subflowInputEntries) => {
    try {
      const workflow = {
        namespace: subflowNamespace.trim(),
        name: subflowName.trim(),
        version: subflowVersion.trim(),
      };
      const values = jsonBuilderEntriesToObject(input);
      if (Object.keys(values).length) workflow.input = values;
      if (!workflow.namespace || !workflow.name || !workflow.version) {
        throw new Error('Sub-flow namespace, name, and version are required.');
      }
      onDocumentChange(updateTopLevelTaskField(document, `/do/${selected.name}`, ['run'], { workflow }));
      setFieldError('');
    } catch (error) {
      setFieldError(error.message || 'Enter a valid sub-flow reference.');
    }
  };

  const changeRunMode = (mode) => {
    setRunMode(mode);
    if (mode === 'javascript') applyField(['run'], { script: { language: 'javascript', code: scriptCode } });
    else applySubflow();
  };

  const applyJsonField = (path, value, expectedType) => {
    try {
      const parsed = JSON.parse(value);
      if (
        expectedType &&
        (expectedType === 'array' ? !Array.isArray(parsed) : typeof parsed !== expectedType)
      ) {
        throw new Error(`Expected a JSON ${expectedType}.`);
      }
      onDocumentChange(updateTopLevelTaskField(document, `/do/${selected.name}`, path, parsed));
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyPairsField = (path, pairs) => {
    const nextValue = pairsToObject(pairs);
    applyField(path, Object.keys(nextValue).length ? nextValue : undefined);
  };

  const applyJsonObjectField = (path, entries) => {
    try {
      const nextValue = jsonBuilderEntriesToObject(entries);
      applyField(path, Object.keys(nextValue).length ? nextValue : undefined);
      setFieldError('');
    } catch (error) {
      setFieldError(error.message || 'Enter valid JSON for the selected property.');
    }
  };

  const applySwitchCases = (nextCases) => {
    const normalized = normalizeSwitchCases(nextCases);
    setSwitchCases(normalized);
    applyField(
      ['switch'],
      normalized.map(({ name: caseName, definition }) => ({ [caseName]: definition })),
    );
  };

  const updateSwitchCase = (index, field, value, commit = false) => {
    const nextCases = switchCases.map((item, itemIndex) =>
      itemIndex === index ? { ...item, definition: { ...item.definition, [field]: value } } : item,
    );
    if (commit) applySwitchCases(nextCases);
    else setSwitchCases(nextCases);
  };

  const addSwitchCase = () => {
    applySwitchCases([
      ...switchCases,
      { name: `case${switchCases.length + 1}`, definition: { when: '${ true }' } },
    ]);
  };

  const removeSwitchCase = (index) => {
    if (switchCases.length <= 1) {
      setFieldError('A switch needs at least one case.');
      return;
    }
    applySwitchCases(switchCases.filter((_, itemIndex) => itemIndex !== index));
  };

  const availableNextTasks = (document.do || [])
    .flatMap((item) => Object.keys(item || {}))
    .filter((taskName) => taskName !== selected.name);
  const selectedNextTask = selected.task.then || '';

  const handleSwitchCaseDrop = (event) => {
    event.preventDefault();
    if (event.dataTransfer.getData('application/open-workflow-switch-case') === 'new-case') addSwitchCase();
  };

  return (
    <aside className={`inspector ${collapsed ? 'inspector-collapsed' : ''}`}>
      <div className="inspector-head">
        <div>
          <span className="section-kicker">Inspector</span>
          <h2>{selected.type} task</h2>
        </div>
        <div className="inspector-head-actions">
          <span className={`task-chip ${taskColors[selected.type] || 'blue'}`}>{selected.type}</span>
          <button
            type="button"
            className="button secondary danger-action inspector-delete-button"
            onClick={onRequestDelete}
            aria-label="Delete task"
          >
            Delete
          </button>
          <button
            className="panel-collapse-button"
            onClick={onToggle}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
            title={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
          >
            {collapsed ? '‹' : '›'}
          </button>
        </div>
      </div>
      <div className="inspector-body">
        <label className="field">
          <span>Task name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => onDocumentChange(updateTopLevelTaskName(document, `/do/${selected.name}`, name))}
          />
        </label>
        {selected.type === 'set' && (
          <label className="field">
            <span>Value</span>
            <input
              value={setValue}
              onChange={(event) => setSetValue(event.target.value)}
              onBlur={() => applyField(['set', 'value'], setValue)}
            />
          </label>
        )}
        {selected.type === 'call' && (
          <>
            <label className="field">
              <span>Method</span>
              <select
                data-ui-owner="native"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  applyField(['with', 'method'], event.target.value);
                }}
              >
                <option>get</option>
                <option>post</option>
                <option>put</option>
                <option>patch</option>
                <option>delete</option>
              </select>
            </label>
            <label className="field">
              <span>Endpoint</span>
              <input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                onBlur={() => applyField(['with', 'endpoint'], endpoint)}
              />
            </label>
            <details className="inspector-parameter-section" open>
              <summary>
                <span>Request parameters</span>
                <small>Optional</small>
              </summary>
              <div className="parameter-section-body">
                <div className="field">
                  <span>
                    Headers <small>Name and value</small>
                  </span>
                  <KeyValuePairs
                    label="HTTP headers"
                    addLabel="Add header"
                    pairs={callHeaders}
                    onChange={setCallHeaders}
                    onCommit={(pairs) => applyPairsField(['with', 'headers'], pairs)}
                  />
                </div>
                <div className="field">
                  <span>
                    Query parameters <small>Name and value</small>
                  </span>
                  <KeyValuePairs
                    label="HTTP query parameters"
                    addLabel="Add parameter"
                    pairs={callQuery}
                    onChange={setCallQuery}
                    onCommit={(pairs) => applyPairsField(['with', 'query'], pairs)}
                  />
                </div>
                <div className="field">
                  <span>
                    Request body <small>Key, value, type</small>
                  </span>
                  <JsonObjectBuilder
                    label="HTTP request body"
                    entries={callBodyEntries}
                    onChange={setCallBodyEntries}
                    onCommit={(entries) => applyJsonObjectField(['with', 'body'], entries)}
                    addLabel="Add body property"
                  />
                </div>
                <label className="field">
                  <span>Response output</span>
                  <select
                    data-ui-owner="native"
                    value={callOutput}
                    onChange={(event) => {
                      setCallOutput(event.target.value);
                      applyField(['with', 'output'], event.target.value);
                    }}
                  >
                    <option value="content">Content</option>
                    <option value="raw">Raw response</option>
                    <option value="response">Full response</option>
                  </select>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={callRedirect}
                    onChange={(event) => {
                      setCallRedirect(event.target.checked);
                      applyField(['with', 'redirect'], event.target.checked);
                    }}
                  />
                  <span>Treat redirects as errors</span>
                </label>
              </div>
            </details>
          </>
        )}
        {selected.type === 'switch' && (
          <div
            className="switch-case-editor"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleSwitchCaseDrop}
          >
            <div className="switch-case-heading">
              <span>Switch cases</span>
              <small>{switchCases.length} configured</small>
            </div>
            {switchCases.map((item, index) => (
              <div className="switch-case-card" key={`${item.name}-${index}`}>
                <div className="switch-case-card-head">
                  <strong>Case {index + 1}</strong>
                  <button type="button" onClick={() => removeSwitchCase(index)}>
                    Remove
                  </button>
                </div>
                <label className="field">
                  <span>Case name</span>
                  <input
                    aria-label={`Case ${index + 1} name`}
                    value={item.name}
                    onChange={(event) => {
                      const nextCases = switchCases.map((current, itemIndex) =>
                        itemIndex === index ? { ...current, name: event.target.value } : current,
                      );
                      setSwitchCases(nextCases);
                    }}
                    onBlur={() => applySwitchCases(switchCases)}
                  />
                </label>
                <label className="field">
                  <span>Condition</span>
                  <input
                    aria-label={`Case ${index + 1} condition`}
                    value={item.definition.when || ''}
                    onChange={(event) => updateSwitchCase(index, 'when', event.target.value)}
                    onBlur={() => updateSwitchCase(index, 'when', item.definition.when || '', true)}
                  />
                </label>
                <label className="field">
                  <span>
                    Flow target <small>optional</small>
                  </span>
                  <input
                    aria-label={`Case ${index + 1} flow target`}
                    value={item.definition.then || ''}
                    onChange={(event) => updateSwitchCase(index, 'then', event.target.value)}
                    onBlur={() => updateSwitchCase(index, 'then', item.definition.then || '', true)}
                  />
                </label>
              </div>
            ))}
            <div className="switch-case-dropzone">
              <span
                draggable
                role="button"
                tabIndex={0}
                aria-label="Drag new switch case"
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/open-workflow-switch-case', 'new-case');
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                Drag “New case” here
              </span>
              <button type="button" className="button secondary" onClick={addSwitchCase}>
                ＋ Add case
              </button>
            </div>
          </div>
        )}
        {selected.type === 'wait' && (
          <DurationField
            label="Wait duration"
            value={duration}
            onChange={(nextValue) => {
              setDuration(nextValue);
              applyField(['wait'], nextValue || undefined);
            }}
          />
        )}
        {selected.type === 'emit' && (
          <>
            <label className="field">
              <span>Event type</span>
              <input
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                onBlur={() => applyField(['emit', 'event', 'with', 'type'], eventType)}
              />
            </label>
            <div className="field">
              <span>
                Event data <small>Key, value, type</small>
              </span>
              <JsonObjectBuilder
                label="Event data"
                entries={eventDataEntries}
                onChange={setEventDataEntries}
                onCommit={(entries) => applyJsonObjectField(['emit', 'event', 'with', 'data'], entries)}
                addLabel="Add event property"
              />
            </div>
          </>
        )}
        {selected.type === 'raise' && (
          <>
            <label className="field">
              <span>Error type</span>
              <input
                value={errorType}
                onChange={(event) => setErrorType(event.target.value)}
                onBlur={() => applyField(['raise', 'error', 'type'], errorType)}
              />
            </label>
            <label className="field">
              <span>HTTP status</span>
              <input
                type="number"
                value={errorStatus}
                onChange={(event) => setErrorStatus(event.target.value)}
                onBlur={() =>
                  applyField(
                    ['raise', 'error', 'status'],
                    errorStatus === '' ? undefined : Number(errorStatus),
                  )
                }
              />
            </label>
            <label className="field">
              <span>Error detail</span>
              <textarea
                className="resize-none"
                value={errorData}
                onChange={(event) => setErrorData(event.target.value)}
                onBlur={() => applyField(['raise', 'error', 'detail'], errorData || undefined)}
              />
            </label>
          </>
        )}
        {selected.type === 'do' && (
          <label className="field">
            <span>
              Nested task list <small>JSON</small>
            </span>
            <textarea
              className="resize-none"
              value={nestedTasks}
              onChange={(event) => setNestedTasks(event.target.value)}
              onBlur={() => applyJsonField(['do'], nestedTasks, 'array')}
              spellCheck="false"
            />
          </label>
        )}
        {selected.type === 'run' && (
          <>
            <label className="field">
              <span>
                Execution type
                <small>run</small>
              </span>
              <select
                aria-label="Run mode"
                data-ui-owner="native"
                value={runMode}
                onChange={(event) => changeRunMode(event.target.value)}
              >
                <option value="javascript">JavaScript function</option>
                <option value="subflow">Sub-flow</option>
              </select>
            </label>
            {runMode === 'javascript' ? (
              <>
                <label className="field">
                  <span>
                    JavaScript function <small>Node sandbox</small>
                  </span>
                  <textarea
                    aria-label="JavaScript code"
                    className="resize-none code-field"
                    value={scriptCode}
                    placeholder="({ input, context }) =&gt; ({ approved: true })"
                    onChange={(event) => setScriptCode(event.target.value)}
                    onBlur={applyScriptCode}
                    spellCheck="false"
                  />
                </label>
                <div className="resource-catalog-section" aria-label="Resource catalogs">
                  <div className="resource-catalog-head">
                    <span>Resource catalogs</span>
                    <small>workflow use.catalogs</small>
                  </div>
                  {catalogEntries.map((entry, index) => (
                    <div className="resource-catalog-row" key={`catalog-${index}`}>
                      <input
                        aria-label={`Resource catalog ${index + 1} name`}
                        placeholder="Catalog name"
                        value={entry.name}
                        onChange={(event) =>
                          setCatalogEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                        onBlur={() => applyCatalogEntries(catalogEntries)}
                      />
                      <input
                        aria-label={`Resource catalog ${index + 1} endpoint`}
                        placeholder="https://catalog.example"
                        value={entry.endpoint}
                        onChange={(event) =>
                          setCatalogEntries((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, endpoint: event.target.value } : item,
                            ),
                          )
                        }
                        onBlur={() => applyCatalogEntries(catalogEntries)}
                      />
                      <button
                        type="button"
                        className="pair-remove"
                        aria-label={`Remove resource catalog ${index + 1}`}
                        onClick={() => {
                          const next = catalogEntries.filter((_, itemIndex) => itemIndex !== index);
                          setCatalogEntries(next);
                          applyCatalogEntries(next);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="pair-add"
                    onClick={() => setCatalogEntries((current) => [...current, { name: '', endpoint: '' }])}
                  >
                    ＋ Add resource catalog
                  </button>
                </div>
                <div className="script-contract-note" role="note">
                  <strong>Function contract</strong>
                  <code>({'{ input, context, catalogs }'}) =&gt; output</code>
                  <span>
                    Return a JSON value. Object fields are added to workflow context for the next task.
                  </span>
                </div>
                <div className="security-note" role="note">
                  <strong>Security boundary</strong>
                  <span>
                    JavaScript is sent to the Node server sandbox with a strict timeout and size limits. The
                    function receives only input, context, and catalog descriptors; it has no filesystem,
                    network, process, or require access.
                  </span>
                </div>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Sub-flow namespace</span>
                  <input
                    aria-label="Sub-flow namespace"
                    value={subflowNamespace}
                    onChange={(event) => setSubflowNamespace(event.target.value)}
                    onBlur={() => applySubflow()}
                  />
                </label>
                <label className="field">
                  <span>Sub-flow name</span>
                  <input
                    aria-label="Sub-flow name"
                    value={subflowName}
                    onChange={(event) => setSubflowName(event.target.value)}
                    onBlur={() => applySubflow()}
                  />
                </label>
                <label className="field">
                  <span>Sub-flow version</span>
                  <input
                    aria-label="Sub-flow version"
                    value={subflowVersion}
                    onChange={(event) => setSubflowVersion(event.target.value)}
                    onBlur={() => applySubflow()}
                  />
                </label>
                <div className="field">
                  <span>
                    Sub-flow input <small>Key, value, type</small>
                  </span>
                  <JsonObjectBuilder
                    label="Sub-flow input mapping"
                    entries={subflowInputEntries}
                    onChange={setSubflowInputEntries}
                    onCommit={(entries) => {
                      setSubflowInputEntries(entries);
                      applySubflow(entries);
                    }}
                    addLabel="Add sub-flow input"
                  />
                </div>
                <div className="script-contract-note" role="note">
                  <strong>Sub-flow boundary</strong>
                  <span>
                    The referenced workflow is resolved by the runtime catalog; this editor does not execute
                    it locally.
                  </span>
                </div>
              </>
            )}
          </>
        )}
        <div className="inspector-section-heading shared-options-heading">
          <span>Shared task options</span>
          <small>Available on every task</small>
        </div>
        <label className="field">
          <span>
            Run condition <small>if</small>
          </span>
          <input
            value={condition}
            placeholder="Optional runtime expression"
            onChange={(event) => setCondition(event.target.value)}
            onBlur={() => applyField(['if'], condition.trim() || undefined)}
          />
        </label>
        <label className="field">
          <span>
            Next task <small>then · available targets</small>
          </span>
          <select
            aria-label="Next task"
            data-ui-owner="native"
            value={selectedNextTask}
            onChange={(event) => applyField(['then'], event.target.value || undefined)}
          >
            <option value="">No next task</option>
            {selectedNextTask && !availableNextTasks.includes(selectedNextTask) && (
              <option value={selectedNextTask}>{selectedNextTask} · current value</option>
            )}
            {availableNextTasks.map((taskName) => (
              <option value={taskName} key={taskName}>
                {taskName}
              </option>
            ))}
          </select>
        </label>
        <DurationField
          label="Timeout"
          value={timeoutValue}
          onChange={(nextValue) => {
            setTimeoutValue(nextValue);
            applyField(['timeout'], nextValue || undefined);
          }}
        />
        <div className="field">
          <span>
            Input mapping <small>Key, value, type</small>
          </span>
          <JsonObjectBuilder
            label="Task input mapping"
            entries={inputEntries}
            onChange={setInputEntries}
            onCommit={(entries) => applyJsonObjectField(['input'], entries)}
          />
        </div>
        <div className="field">
          <span>
            Output mapping <small>Key, value, type</small>
          </span>
          <JsonObjectBuilder
            label="Task output mapping"
            entries={outputEntries}
            onChange={setOutputEntries}
            onCommit={(entries) => applyJsonObjectField(['output'], entries)}
          />
        </div>
        <div className="field">
          <span>
            Export mapping <small>Key, value, type</small>
          </span>
          <JsonObjectBuilder
            label="Task export mapping"
            entries={exportEntries}
            onChange={setExportEntries}
            onCommit={(entries) => applyJsonObjectField(['export'], entries)}
          />
        </div>
        <div className="field">
          <span>
            Metadata <small>Key, value, type</small>
          </span>
          <JsonObjectBuilder
            label="Task metadata"
            entries={metadataEntries}
            onChange={setMetadataEntries}
            onCommit={(entries) => applyJsonObjectField(['metadata'], entries)}
          />
        </div>
        {fieldError && (
          <div className="field-error" role="alert">
            {fieldError}
          </div>
        )}
        <details className="inspector-advanced">
          <summary>
            <span>Advanced task configuration</span>
            <small>Raw JSON</small>
          </summary>
          <textarea
            className="resize-none"
            aria-label="Advanced task configuration"
            value={config}
            onChange={(event) => setConfig(event.target.value)}
            onBlur={applyConfig}
            spellCheck="false"
          />
        </details>
        <div className="field-hint">
          <span>⌘</span>
          <p>
            Edit the configuration directly. Changes are validated against the Open Workflow schema when
            applied.
          </p>
        </div>
      </div>
    </aside>
  );
}

function ConfirmDialog({ task, onCancel, onConfirm }) {
  const cancelButton = useRef(null);

  useEffect(() => {
    if (!task) return undefined;
    cancelButton.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, task]);

  if (!task) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-task-title"
      >
        <span className="dialog-kicker">Destructive action</span>
        <h2 id="delete-task-title">Delete “{task.name}”?</h2>
        <p>
          This removes the task from the workflow and clears routes pointing to it. You can undo the change
          with <kbd>⌘Z</kbd> or <kbd>Ctrl+Z</kbd>.
        </p>
        <div className="dialog-actions">
          <button ref={cancelButton} type="button" className="button secondary" onClick={onCancel}>
            Keep task
          </button>
          <button type="button" className="button danger-button" onClick={onConfirm}>
            Delete task
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const initialLibrary = useMemo(() => readInitialWorkflowLibrary(), []);
  const initialRecord = initialLibrary[0];
  const initial = useMemo(() => {
    try {
      return parseWorkflow(initialRecord?.specification || SAMPLE_WORKFLOW);
    } catch {
      return parseWorkflow(SAMPLE_WORKFLOW);
    }
  }, [initialRecord]);
  const initialPositions = initialRecord?.positions || {};
  const initialWorkflowId = initialRecord?.id || 'workflow-default';
  const [workflowRecords, setWorkflowRecords] = useState(initialLibrary);
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [document, setDocument] = useState(initial.document);
  const [specText, setSpecText] = useState(() => serializeWorkflow(initial.document, initialRecord?.format));
  const [specFormat, setSpecFormat] = useState(initialRecord?.format || 'yaml');
  const [workflowName, setWorkflowName] = useState(initial.document.document.name);
  const [positions, setPositions] = useState(initialPositions);
  const [nodes, setNodes] = useState(() => createFlowGraph(initial.document, initialPositions).nodes);
  const [edges, setEdges] = useState(() => createFlowGraph(initial.document, initialPositions).edges);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('canvas');
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [isHydrating, setIsHydrating] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
  const [isValidatingWorkflow, setIsValidatingWorkflow] = useState(false);
  const [layoutMode, setLayoutMode] = useState('manual');
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(true);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState(null);
  const activeExample = SMART_CITY_WORKFLOWS.find((example) => example.id === workflowId);
  const fileInput = useRef(null);
  const initialLayoutPromise = useRef(null);
  const workflowPersistence = useMemo(
    () => assertWorkflowPersistence(createWorkflowPersistence(window.localStorage, WORKFLOW_LIBRARY_KEY)),
    [],
  );

  useEffect(() => {
    const protectUnsavedChanges = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedChanges);
    return () => window.removeEventListener('beforeunload', protectUnsavedChanges);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    if (workflowId !== initialWorkflowId || document !== initial.document) {
      setIsLayouting(false);
      setIsHydrating(false);
      return () => {
        active = false;
      };
    }

    if (Object.keys(initialPositions).length > 0) {
      setIsLayouting(false);
      setIsHydrating(false);
      return () => {
        active = false;
      };
    }

    setIsLayouting(true);
    initialLayoutPromise.current ||= autoLayoutFlow(initial.document);
    initialLayoutPromise.current
      .then((nextPositions) => {
        if (!active) return;
        const flow = createFlowGraph(initial.document, nextPositions);
        setPositions(nextPositions);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setLayoutRevision((current) => current + 1);
      })
      .catch(() => {
        if (!active) return;
        setNotice('Initial layout failed');
        window.setTimeout(() => setNotice(''), 1800);
      })
      .finally(() => {
        if (!active) return;
        setIsLayouting(false);
        setIsHydrating(false);
      });

    return () => {
      active = false;
    };
  }, [document, initial.document, initialPositions, initialWorkflowId, workflowId]);

  const persistWorkflowRecords = (nextRecords) => {
    workflowPersistence.replace(nextRecords);
    setWorkflowRecords(nextRecords);
  };

  const openWorkflowRecord = (record) => {
    try {
      const parsed = parseWorkflow(record.specification);
      const recordPositions = record.positions || {};
      const flow = createFlowGraph(parsed.document, recordPositions);
      setWorkflowId(record.id);
      setDocument(parsed.document);
      setWorkflowName(parsed.document.document.name);
      setSpecFormat(record.format === 'json' ? 'json' : 'yaml');
      setSpecText(serializeWorkflow(parsed.document, record.format));
      setPositions(recordPositions);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
      setValidationError(formatGraphIssues(parsed.document));
      setHistory([]);
      setFuture([]);
      setLayoutMode('manual');
      setIsHydrating(false);
      setDirty(false);
    } catch (error) {
      setNotice(`Could not open workflow: ${formatError(error)}`);
      window.setTimeout(() => setNotice(''), 2400);
    }
  };

  const rememberCurrent = useCallback(() => {
    setHistory((current) => [
      ...current.slice(-49),
      { document: JSON.parse(JSON.stringify(document)), positions: { ...positions } },
    ]);
    setFuture([]);
  }, [document, positions]);

  const syncDocument = useCallback(
    (nextDocument, extraPositions = {}, replacePositions = false) => {
      if (validationError) {
        setNotice('Fix the specification error before editing the canvas');
        window.setTimeout(() => setNotice(''), 1800);
        return;
      }
      try {
        const nextText = serializeWorkflow(nextDocument, specFormat);
        if (JSON.stringify(nextDocument) !== JSON.stringify(document)) rememberCurrent();
        const nextPositions = replacePositions ? extraPositions : { ...positions, ...extraPositions };
        const flow = createFlowGraph(nextDocument, nextPositions);
        setDocument(nextDocument);
        setWorkflowName(nextDocument.document.name);
        setSpecText(nextText);
        setPositions(nextPositions);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setValidationError(formatGraphIssues(nextDocument));
        setDirty(true);
      } catch (error) {
        setValidationError(formatError(error));
      }
    },
    [document, positions, rememberCurrent, specFormat, validationError],
  );

  const handleSpecificationChange = (value) => {
    setSpecText(value);
    setDirty(true);
    try {
      const parsed = parseWorkflow(value);
      const flow = createFlowGraph(parsed.document, positions);
      if (JSON.stringify(parsed.document) !== JSON.stringify(document)) rememberCurrent();
      setDocument(parsed.document);
      setWorkflowName(parsed.document.document.name);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setValidationError(formatGraphIssues(parsed.document));
    } catch (error) {
      setValidationError(formatError(error));
    }
  };

  const updatePosition = useCallback(
    (id, position) => {
      rememberCurrent();
      setPositions((current) => ({ ...current, [id]: position }));
      setLayoutMode('manual');
      setDirty(true);
    },
    [rememberCurrent],
  );

  const restoreSnapshot = useCallback(
    (snapshot) => {
      const flow = createFlowGraph(snapshot.document, snapshot.positions);
      setDocument(snapshot.document);
      setWorkflowName(snapshot.document.document.name);
      setPositions(snapshot.positions);
      setSpecText(serializeWorkflow(snapshot.document, specFormat));
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
      setValidationError(formatGraphIssues(snapshot.document));
      setDirty(true);
    },
    [specFormat],
  );

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [
      ...current,
      { document: JSON.parse(JSON.stringify(document)), positions: { ...positions } },
    ]);
    restoreSnapshot(previous);
  };

  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setFuture((current) => current.slice(0, -1));
    setHistory((current) => [
      ...current,
      { document: JSON.parse(JSON.stringify(document)), positions: { ...positions } },
    ]);
    restoreSnapshot(next);
  };

  const save = async () => {
    if (validationError) {
      setNotice('Fix validation errors before saving');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    setSaveState('saving');
    try {
      const record = createWorkflowRecord({
        id: workflowId,
        document,
        specification: specText,
        format: specFormat,
        positions,
      });
      const nextRecords = upsertWorkflowRecord(workflowRecords, record);
      setWorkflowRecords(nextRecords);
      await replaceWorkflowRecordsWithState(workflowPersistence, nextRecords, ({ status }) =>
        setSaveState(status),
      );
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: PERSISTENCE_VERSION, specification: specText, format: specFormat }),
      );
      window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
      window.localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ version: PERSISTENCE_VERSION, specFormat }),
      );
    } catch (error) {
      try {
        workflowPersistence.replace(workflowRecords);
      } catch {
        // Preserve the original error state if the persistence layer is unavailable.
      }
      setWorkflowRecords(workflowRecords);
      setSaveState('error');
      setNotice(`Save failed: ${error.message || 'local storage is unavailable'}`);
      window.setTimeout(() => setNotice(''), 2400);
      return;
    }
    setSaveState('saved');
    setDirty(false);
    setNotice('Saved locally');
    window.setTimeout(() => setNotice(''), 1800);
  };

  const newWorkflow = () => {
    if (dirty && !window.confirm('Discard unsaved changes and create a new workflow?')) return;
    const parsed = parseWorkflow(NEW_WORKFLOW);
    const name = uniqueWorkflowName(workflowRecords, parsed.document.document.name);
    const nextDocument = {
      ...parsed.document,
      document: { ...parsed.document.document, name },
    };
    setWorkflowId(createWorkflowId());
    setSelectedId(null);
    setWorkflowName(name);
    syncDocument(nextDocument, {}, true);
  };

  const duplicateWorkflow = () => {
    if (validationError) {
      setNotice('Fix validation errors before duplicating');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    const name = uniqueWorkflowName(workflowRecords, `${document.document.name}-copy`);
    const nextDocument = {
      ...document,
      document: { ...document.document, name },
    };
    setWorkflowId(createWorkflowId());
    setWorkflowName(name);
    syncDocument(nextDocument, positions, true);
    setNotice('Workflow duplicated — save to keep it');
    window.setTimeout(() => setNotice(''), 2200);
  };

  const renameWorkflow = () => {
    const name = workflowName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!name || name === document.document.name) {
      setWorkflowName(document.document.name);
      return;
    }
    if (workflowRecords.some((record) => record.id !== workflowId && record.name === name)) {
      setWorkflowName(document.document.name);
      setNotice('A workflow with that name already exists');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    const nextDocument = {
      ...document,
      document: { ...document.document, name },
    };
    syncDocument(nextDocument);
  };

  const deleteWorkflow = () => {
    if (!window.confirm(`Delete workflow “${document.document.name}”?`)) return;
    const remaining = removeWorkflowRecord(workflowRecords, workflowId);
    if (!remaining.length) {
      const parsed = parseWorkflow(NEW_WORKFLOW);
      const name = uniqueWorkflowName([], parsed.document.document.name);
      const id = createWorkflowId();
      const nextDocument = { ...parsed.document, document: { ...parsed.document.document, name } };
      setWorkflowId(id);
      setWorkflowName(name);
      syncDocument(nextDocument, {}, true);
      persistWorkflowRecords([]);
      return;
    }
    persistWorkflowRecords(remaining);
    openWorkflowRecord(remaining[0]);
  };

  const switchWorkflow = (nextId) => {
    if (nextId === workflowId) return;
    if (dirty && !window.confirm('Discard unsaved changes and open another workflow?')) return;
    const record = workflowRecords.find((item) => item.id === nextId);
    if (record) openWorkflowRecord(record);
  };

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const next = duplicateTopLevelTask(document, selectedId);
    if (next !== document) syncDocument(next);
  }, [document, selectedId, syncDocument]);

  const addPaletteTask = (taskType) => {
    const next = addTopLevelTask(document, taskType);
    const createdName = Object.keys(next.do[next.do.length - 1])[0];
    setSelectedId(`/do/${createdName}`);
    syncDocument(next);
  };

  const formatSpec = () => {
    try {
      const parsed = parseWorkflow(specText);
      setSpecText(serializeWorkflow(parsed.document, specFormat));
      setValidationError(formatGraphIssues(parsed.document));
    } catch (error) {
      setValidationError(formatError(error));
    }
  };

  const changeSpecFormat = (format) => {
    try {
      const parsed = parseWorkflow(specText);
      setSpecFormat(format);
      setSpecText(serializeWorkflow(parsed.document, format));
      setValidationError(formatGraphIssues(parsed.document));
    } catch (error) {
      setValidationError(formatError(error));
    }
  };

  const copySpec = async () => {
    try {
      await navigator.clipboard.writeText(specText);
      setNotice('Copied specification');
    } catch {
      setNotice('Clipboard unavailable');
    }
    window.setTimeout(() => setNotice(''), 1800);
  };

  const autoLayout = async () => {
    setIsLayouting(true);
    try {
      rememberCurrent();
      const nextPositions = await autoLayoutFlow(document);
      const flow = createFlowGraph(document, nextPositions);
      setPositions(nextPositions);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setLayoutMode('auto');
      setLayoutRevision((current) => current + 1);
      setDirty(true);
      setNotice('Layout updated');
    } catch {
      setNotice('Layout failed');
    } finally {
      setIsLayouting(false);
      window.setTimeout(() => setNotice(''), 1800);
    }
  };

  const exportSpec = () => {
    if (validationError) {
      setNotice('Fix validation errors before exporting');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    const extension = specFormat === 'json' ? 'json' : 'yaml';
    const blob = new Blob([specText], { type: specFormat === 'json' ? 'application/json' : 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.document.name || 'workflow'}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const validateWorkflowDefinition = () => {
    setIsValidatingWorkflow(true);
    const issues = formatGraphIssues(document);
    setValidationError(issues);
    setNotice(issues ? 'Workflow needs attention' : 'Workflow is valid');
    setIsValidatingWorkflow(false);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const importSpec = (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (dirty && !window.confirm('Discard unsaved changes and import this workflow?')) {
      event.target.value = '';
      return;
    }
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      handleSpecificationChange(String(reader.result || ''));
      setIsImporting(false);
    };
    reader.onerror = () => {
      setValidationError('Could not read the selected workflow file.');
      setIsImporting(false);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const selected = selectedId ? getTopLevelTask(document, selectedId) : null;
  const requestTaskDelete = () => {
    if (selected) setTaskDeleteRequest({ id: selectedId, name: selected.name });
  };
  const confirmTaskDelete = () => {
    if (!taskDeleteRequest) return;
    const next = removeTopLevelTask(document, taskDeleteRequest.id);
    if (next !== document) syncDocument(next);
    setSelectedId(null);
    setTaskDeleteRequest(null);
  };
  const allPanelsCollapsed = leftRailCollapsed && inspectorCollapsed && !runtimeOpen;
  const toggleAllPanels = () => {
    const nextCollapsed = !allPanelsCollapsed;
    setLeftRailCollapsed(nextCollapsed);
    setInspectorCollapsed(nextCollapsed);
    setRuntimeOpen(!nextCollapsed);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <span />
          </div>
          <span className="brand-name">
            open workflow <em>editor</em>
          </span>
          <span className="beta-pill">LOCAL</span>
        </div>
        <div className="topbar-center">
          <span className="status-led" />
          Open Workflow Specification <strong>1.0.3</strong>
        </div>
        <div className="topbar-actions">
          <span className="save-state">
            <i className={`${dirty ? 'dirty' : ''} ${saveState}`} />
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'error'
                ? 'Save failed'
                : dirty
                  ? 'Unsaved changes'
                  : 'Saved locally'}
          </span>
          <button className="button secondary" onClick={save} disabled={!dirty || saveState === 'saving'}>
            Save
          </button>
          <button
            className={`button validation-command ${validationError ? 'invalid' : 'valid'}`}
            onClick={validateWorkflowDefinition}
            disabled={isValidatingWorkflow}
          >
            <i />
            {isValidatingWorkflow ? 'Checking…' : 'Validate workflow'}
          </button>
          <button
            className="button secondary panel-layout-toggle"
            onClick={toggleAllPanels}
            aria-label={allPanelsCollapsed ? 'Expand all side panels' : 'Collapse all side panels'}
            title={allPanelsCollapsed ? 'Expand all side panels' : 'Collapse all side panels'}
          >
            <span className="panel-layout-toggle-icon">{allPanelsCollapsed ? '›' : '‹'}</span>
            <span className="panel-layout-toggle-label">
              {allPanelsCollapsed ? 'Expand panels' : 'Focus canvas'}
            </span>
          </button>
          <span className="avatar" role="img" aria-label="Open Workflow Editor workspace">
            OW
          </span>
        </div>
      </header>
      <div
        className={`editor-layout ${leftRailCollapsed ? 'left-rail-collapsed' : ''} ${allPanelsCollapsed ? 'all-panels-collapsed' : ''}`}
      >
        <Palette
          onNewWorkflow={newWorkflow}
          onAddTask={addPaletteTask}
          collapsed={leftRailCollapsed}
          onToggle={() => setLeftRailCollapsed((current) => !current)}
        />
        <section className="workspace">
          <div className="workspace-head">
            <div>
              <span className="breadcrumb">Dubai Government cases /</span>
              <div className="workflow-title-row">
                <input
                  className="workflow-name-input"
                  value={workflowName}
                  aria-label="Workflow name"
                  onChange={(event) => setWorkflowName(event.target.value)}
                  onBlur={renameWorkflow}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <select
                  className="workflow-picker"
                  value={workflowId}
                  aria-label="Dubai Government workflow examples"
                  onChange={(event) => switchWorkflow(event.target.value)}
                >
                  {!workflowRecords.some((record) => record.id === workflowId) && (
                    <option value={workflowId}>{workflowName} · unsaved</option>
                  )}
                  {workflowRecords.map((record) => {
                    const example = SMART_CITY_WORKFLOWS.find((candidate) => candidate.id === record.id);
                    return (
                      <option key={record.id} value={record.id}>
                        {example?.label || record.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <p>{activeExample?.description || 'Build, validate, and simulate this workflow.'}</p>
              {activeExample?.referenceUrl && (
                <a
                  className="workflow-reference"
                  href={activeExample.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official case: {activeExample.referenceLabel}
                </a>
              )}
            </div>
            <div className="workspace-actions">
              <button className="button secondary" onClick={duplicateWorkflow} title="Duplicate workflow">
                Duplicate
              </button>
              <button
                className="button secondary danger-action"
                onClick={deleteWorkflow}
                title="Delete workflow"
              >
                Delete
              </button>
              <button
                className="button secondary icon-action"
                onClick={undo}
                disabled={!history.length}
                title="Undo"
                aria-label="Undo"
              >
                ↶
              </button>
              <button
                className="button secondary icon-action"
                onClick={redo}
                disabled={!future.length}
                title="Redo"
                aria-label="Redo"
              >
                ↷
              </button>
              <button className="button secondary" onClick={autoLayout} disabled={isLayouting}>
                {isLayouting ? 'Layout…' : 'Auto layout'}
              </button>
              <button
                className="button secondary"
                onClick={() => setLayoutMode((current) => (current === 'manual' ? 'auto' : 'manual'))}
                title="Toggle whether nodes can be repositioned"
              >
                {layoutMode === 'manual' ? 'Manual layout' : 'Unlock layout'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".yaml,.yml,.json,text/yaml,application/json"
                onChange={importSpec}
                hidden
              />
              <button className="button secondary" onClick={() => fileInput.current?.click()}>
                Import
              </button>
              <button className="button secondary" onClick={exportSpec}>
                Export
              </button>
              <button className="button secondary" onClick={formatSpec}>
                Format
              </button>
              <button className="button secondary" onClick={copySpec}>
                Copy
              </button>
            </div>
          </div>
          <div className="mode-tabs">
            <button className={view === 'canvas' ? 'active' : ''} onClick={() => setView('canvas')}>
              Canvas
            </button>
            <button className={view === 'spec' ? 'active' : ''} onClick={() => setView('spec')}>
              Specification
            </button>
            <span className="tab-spacer" />
            {validationError ? (
              <span className="validation invalid">
                <i />
                Invalid specification
              </span>
            ) : (
              <span className="validation">
                <i />
                Valid specification
              </span>
            )}
          </div>
          {validationError && (
            <div className="validation-banner">
              <strong>{validationTitle(validationError)}</strong>
              <pre>{validationError}</pre>
            </div>
          )}
          <div className="workspace-content">
            {isHydrating ? (
              <div className="state-panel loading-state" role="status">
                <span className="state-spinner" />
                <strong>Loading workflow</strong>
                <p>Restoring your local editor state…</p>
              </div>
            ) : isImporting ? (
              <div className="state-panel loading-state" role="status">
                <span className="state-spinner" />
                <strong>Parsing workflow</strong>
                <p>Validating the selected specification…</p>
              </div>
            ) : view === 'canvas' ? (
              <ReactFlowProvider>
                <EditorCanvas
                  document={document}
                  nodes={nodes}
                  setNodes={setNodes}
                  edges={edges}
                  setEdges={setEdges}
                  setPositions={setPositions}
                  setDirty={setDirty}
                  onDocumentChange={syncDocument}
                  onPositionChange={updatePosition}
                  setSelectedId={setSelectedId}
                  selectedId={selectedId}
                  layoutMode={layoutMode}
                  onUndo={undo}
                  onRedo={redo}
                  onSave={save}
                  onDuplicateSelected={duplicateSelected}
                  layoutKey={`${leftRailCollapsed ? 'left' : 'full'}-${allPanelsCollapsed ? 'focus' : 'open'}-${layoutMode}-${layoutRevision}`}
                />
              </ReactFlowProvider>
            ) : (
              <div className="spec-view">
                <div className="spec-bar">
                  <span>
                    {document.document.name}.{specFormat === 'json' ? 'json' : 'yaml'}
                  </span>
                  <div className="format-toggle">
                    <button
                      className={specFormat === 'yaml' ? 'active' : ''}
                      onClick={() => changeSpecFormat('yaml')}
                    >
                      YAML
                    </button>
                    <button
                      className={specFormat === 'json' ? 'active' : ''}
                      onClick={() => changeSpecFormat('json')}
                    >
                      JSON
                    </button>
                  </div>
                  <span className="tab-spacer" />
                  <span>Live validation</span>
                </div>
                <textarea
                  className="resize-none"
                  value={specText}
                  onChange={(event) => handleSpecificationChange(event.target.value)}
                  spellCheck="false"
                />
              </div>
            )}
          </div>
        </section>
        <aside className="right-rail" aria-label="Workflow operations">
          <Inspector
            selected={selected}
            document={document}
            onDocumentChange={syncDocument}
            onRequestDelete={requestTaskDelete}
            collapsed={inspectorCollapsed}
            onToggle={() => setInspectorCollapsed((current) => !current)}
          />
          <RuntimePanel document={document} side open={runtimeOpen} onOpenChange={setRuntimeOpen} />
        </aside>
      </div>
      <ConfirmDialog
        task={taskDeleteRequest}
        onCancel={() => setTaskDeleteRequest(null)}
        onConfirm={confirmTaskDelete}
      />
      <footer className="app-footer">
        <span>
          <i className="status-led" />
          Local editor
        </span>
        <span>Drag tasks · Connect handles · ⌘D duplicate · ⌘Z undo · F fit view</span>
        <span>{notice || 'Demo engine ready · gateway not connected'}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
