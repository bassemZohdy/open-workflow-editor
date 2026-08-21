import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import {
  addTopLevelTask,
  autoLayoutFlow,
  createFlowGraph,
  duplicateTopLevelTask,
  getTopLevelTask,
  NEW_WORKFLOW,
  parseWorkflow,
  removeTopLevelTask,
  SAMPLE_WORKFLOW,
  SMART_CITY_WORKFLOWS,
  serializeWorkflow,
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
import {
  formatError,
  formatGraphIssues,
  validationTitle,
} from './formatters';
import { RuntimePanel } from './components/runtime';
import { Palette, ConfirmDialog } from './components/layout';
import { EditorCanvas } from './components/canvas';
import { Inspector } from './components/inspector';

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
