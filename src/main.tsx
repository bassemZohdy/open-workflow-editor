import {
  Fragment,
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { dump as yamlDump } from 'js-yaml';
import './styles.css';
import {
  addTopLevelAiTask,
  addTopLevelTask,
  AI_PROVIDER_CATALOG,
  autoLayoutFlow,
  createAiSubflowDocument,
  createFlowGraph,
  detectMissingSubflowReferences,
  duplicateTopLevelTask,
  getBreadcrumbPath,
  getTopLevelTask,
  NEW_WORKFLOW,
  parseWorkflow,
  removeTopLevelTask,
  SAMPLE_WORKFLOW,
  SMART_CITY_WORKFLOWS,
  serializeWorkflow,
  validateGraph,
} from './workflowModel';
import { getAiComponent, findAiComponentBySubflow } from './ai/registry';
import {
  createWorkflowRecord,
  createWorkflowPersistence,
  assertWorkflowPersistence,
  parseWorkflowLibrary,
  replaceWorkflowRecordsWithState,
  removeWorkflowRecord,
  reorderWorkflowIds,
  uniqueWorkflowName,
  upsertWorkflowRecord,
  buildLibraryRows,
} from './workflowStore';
import { formatError, formatGraphIssues, validationTitle, collectSpecDiagnostics } from './formatters';
import {
  collectWorkspaceDocuments,
  createRequestIdSequence,
  findMatchingSubflowTab,
  subflowRecordMatchesTarget,
} from './subflowWiring';
import type { SpecDiagnostic } from './formatters';
import { RuntimePanel } from './components/runtime';
import {
  Palette,
  ConfirmDialog,
  ShortcutsDialog,
  TemplateLibraryDialog,
  RevisionHistoryDialog,
  DocumentTabs,
  DeploymentBundleDialog,
} from './components/layout';
import { CommandPalette, type PaletteCommand } from './components/layout/CommandPalette';
import {
  QuickOpenDialog,
  type QuickOpenItem,
  type WorkspaceSearchItem,
} from './components/layout/QuickOpenDialog';
import { ContextMenu, type ContextMenuRequest } from './components/layout/ContextMenu';
import { ProblemsPanel, type ProblemItem } from './components/layout/ProblemsPanel';
import { StatusBar } from './components/layout/StatusBar';
import { ResizeHandle } from './components/layout/ResizeHandle';
import { SpecEditor } from './components/layout/SpecEditor';
import { SettingsDialog } from './components/layout/SettingsDialog';
import type { LibraryWorkflowRow } from './components/layout/LibraryExplorer';
import { openWorkflowFile, saveWorkflowFile } from './fileSystemAdapter';
import type { AiTaskKind } from './scriptContract';
import { EditorCanvas } from './components/canvas';
import { Inspector } from './components/inspector';
import { DEFAULT_PALETTE_GROUPS, paletteItems } from './taskMeta';
import type { WorkflowTemplate } from './fixtures/templates';
import type {
  WorkflowDocument,
  WorkflowFormat,
  WorkflowRecord,
  WorkflowRevision,
  CanvasPositions,
  FlowNode,
  FlowEdge,
  TaskType,
  AppTheme,
} from './types';

const STORAGE_KEY = 'open-workflow-editor:dubai-government:v1';
const POSITIONS_KEY = 'open-workflow-editor:positions:v4';
const PREFERENCES_KEY = 'open-workflow-editor:preferences:v4';
const WORKFLOW_LIBRARY_KEY = 'open-workflow-editor:library:v4';
const PANEL_WIDTHS_KEY = 'open-workflow-editor:panel-widths:v1';
const CANVAS_PREFS_KEY = 'open-workflow-editor:canvas-prefs:v1';
const VIEWPORTS_KEY = 'open-workflow-editor:viewports:v1';
const RAIL_SECTIONS_KEY = 'open-workflow-editor:rail-sections:v1';
const LIBRARY_ORDER_KEY = 'open-workflow-editor:library-order:v1';
const PALETTE_GROUP_ORDER_KEY = 'open-workflow-editor:palette-group-order:v1';
const WORKFLOW_THEMES_KEY = 'open-workflow-editor:workflow-themes:v1';
const PERSISTENCE_VERSION = 1;

interface StoredWorkflow {
  specification: string;
  format: WorkflowFormat;
}

interface HistorySnapshot {
  document: WorkflowDocument;
  positions: CanvasPositions;
}

interface TaskDeleteRequest {
  id: string;
  name: string;
}

interface SettingsProfile {
  version?: number;
  theme?: AppTheme;
  showMiniMap?: boolean;
  panelWidths?: { left: number; right: number };
  railSections?: { library: boolean; palette: boolean; groups: Record<string, boolean> };
  leftRailCollapsed?: boolean;
  inspectorCollapsed?: boolean;
  runtimeOpen?: boolean;
  gatewayUrl?: string;
}

function readStoredWorkflow(): StoredWorkflow {
  const fallback: StoredWorkflow = { specification: SAMPLE_WORKFLOW, format: 'yaml' };
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

function createWorkflowId(): string {
  return typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPanelWidths(): { left: number; right: number } {
  const defaults = { left: 246, right: 340 };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PANEL_WIDTHS_KEY) || 'null');
    if (
      raw &&
      typeof raw.left === 'number' &&
      Number.isFinite(raw.left) &&
      typeof raw.right === 'number' &&
      Number.isFinite(raw.right)
    ) {
      return { left: raw.left, right: raw.right };
    }
  } catch {
    // Corrupt widths — fall back to the design defaults.
  }
  return defaults;
}

function readCanvasPrefs(): { showMiniMap: boolean } {
  const defaults = { showMiniMap: true };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = JSON.parse(window.localStorage.getItem(CANVAS_PREFS_KEY) || 'null');
    if (raw && typeof raw.showMiniMap === 'boolean') return { showMiniMap: raw.showMiniMap };
  } catch {
    // Corrupt prefs — fall back to defaults.
  }
  return defaults;
}

function readViewports(): Record<string, { x: number; y: number; zoom: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(VIEWPORTS_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw as Record<string, { x: number; y: number; zoom: number }>;
  } catch {
    // Corrupt viewport store — start fresh.
  }
  return {};
}

function readLibraryOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(LIBRARY_ORDER_KEY) || 'null');
    if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');
  } catch {
    // Corrupt order — fall back to document order.
  }
  return [];
}

function readPaletteGroupOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(PALETTE_GROUP_ORDER_KEY) || 'null');
    if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');
  } catch {
    // Corrupt order — fall back to the default group order.
  }
  return [];
}

function readWorkflowThemes(): Record<string, AppTheme> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(WORKFLOW_THEMES_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw as Record<string, AppTheme>;
  } catch {
    // Corrupt store — start fresh.
  }
  return {};
}

function readRailSections(): { library: boolean; palette: boolean; groups: Record<string, boolean> } {
  const defaults = { library: true, palette: true, groups: {} as Record<string, boolean> };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = JSON.parse(window.localStorage.getItem(RAIL_SECTIONS_KEY) || 'null');
    if (raw && typeof raw.library === 'boolean' && typeof raw.palette === 'boolean') {
      return {
        library: raw.library,
        palette: raw.palette,
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
      };
    }
  } catch {
    // Corrupt section state — fall back to expanded.
  }
  return defaults;
}

function readInitialWorkflowLibrary(): WorkflowRecord[] {
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
  const initialPositions = useMemo(() => initialRecord?.positions || {}, [initialRecord]);
  const initialWorkflowId = initialRecord?.id || 'workflow-default';
  const [workflowRecords, setWorkflowRecords] = useState<WorkflowRecord[]>(initialLibrary);
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [document, setDocument] = useState<WorkflowDocument>(initial.document);
  const [specText, setSpecText] = useState(() => serializeWorkflow(initial.document, initialRecord?.format));
  const [specFormat, setSpecFormat] = useState<WorkflowFormat>(initialRecord?.format || 'yaml');
  const [workflowName, setWorkflowName] = useState(initial.document.document?.name || 'workflow');
  const [positions, setPositions] = useState<CanvasPositions>(initialPositions);
  const [nodes, setNodes] = useState<FlowNode[]>(
    () => createFlowGraph(initial.document, initialPositions).nodes,
  );
  const [edges, setEdges] = useState<FlowEdge[]>(
    () => createFlowGraph(initial.document, initialPositions).edges,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'canvas' | 'spec'>('canvas');
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved');
  const [isHydrating, setIsHydrating] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
  const [isValidatingWorkflow, setIsValidatingWorkflow] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'manual'>('manual');
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(true);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState<TaskDeleteRequest | null>(null);
  const [globalTheme, setGlobalTheme] = useState<AppTheme>(() => {
    return (window.localStorage.getItem('open-workflow-theme') as AppTheme) || 'light';
  });
  const [workflowThemes, setWorkflowThemes] = useState<Record<string, AppTheme>>(() => readWorkflowThemes());
  /** Resolved theme: per-workflow override wins, global theme is the fallback. */
  const theme: AppTheme = workflowThemes[workflowId] || globalTheme;
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeploymentBundle, setShowDeploymentBundle] = useState(false);
  const [openTabIds, setOpenTabIds] = useState<string[]>([workflowId]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [quickOpenMode, setQuickOpenMode] = useState<'files' | 'search'>('files');
  const [quickOpenSearchQuery, setQuickOpenSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuRequest | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [specCursor, setSpecCursor] = useState<{ line: number; column: number } | null>(null);
  const [specJump, setSpecJump] = useState<{ line: number; column: number; requestId: number } | null>(null);
  const [syntaxError, setSyntaxError] = useState<unknown>(null);
  const [runtimeHealthy, setRuntimeHealthy] = useState<boolean | null>(null);
  const [panelWidths, setPanelWidths] = useState<{ left: number; right: number }>(() => readPanelWidths());
  const [canvasSearchRequest, setCanvasSearchRequest] = useState<{ term: string; requestId: number } | null>(
    null,
  );
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [zoomRequest, setZoomRequest] = useState<{
    direction: 'in' | 'out' | 'reset';
    requestId: number;
  } | null>(null);
  const [canvasPrefs, setCanvasPrefs] = useState<{ showMiniMap: boolean }>(() => readCanvasPrefs());
  const [viewports, setViewports] = useState<Record<string, { x: number; y: number; zoom: number }>>(() =>
    readViewports(),
  );
  const [railSections, setRailSections] = useState<{
    library: boolean;
    palette: boolean;
    groups: Record<string, boolean>;
  }>(() => readRailSections());
  const [libraryOrder, setLibraryOrder] = useState<string[]>(() => readLibraryOrder());
  const [paletteGroupOrder, setPaletteGroupOrder] = useState<string[]>(() => readPaletteGroupOrder());
  const [revealActiveTick, setRevealActiveTick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [aiScaffoldRequest, setAiScaffoldRequest] = useState<{ kind: AiTaskKind; requestId: number } | null>(
    null,
  );
  // Task 65: `Date.now()` ids collide for same-millisecond adds, so the
  // scaffold effect (keyed on requestId) dropped the second request. A
  // monotonic sequence guarantees every add re-triggers the effect.
  const aiScaffoldRequestSequenceRef = useRef<(() => number) | null>(null);
  if (aiScaffoldRequestSequenceRef.current === null) {
    aiScaffoldRequestSequenceRef.current = createRequestIdSequence();
  }
  const [executionStatusMap, setExecutionStatusMap] = useState<
    Record<string, 'running' | 'success' | 'failed' | 'waiting'>
  >({});
  const activeExample = SMART_CITY_WORKFLOWS.find((example) => example.id === workflowId);
  const fileInput = useRef<HTMLInputElement>(null);
  const initialLayoutPromise = useRef<Promise<CanvasPositions> | null>(null);
  const tabDocumentsRef = useRef<
    Map<
      string,
      {
        id: string;
        name: string;
        document: WorkflowDocument;
        specText: string;
        specFormat: WorkflowFormat;
        positions: CanvasPositions;
        dirty: boolean;
        history: HistorySnapshot[];
        future: HistorySnapshot[];
      }
    >
  >(new Map());
  /**
   * Workspace sub-flow documents (open tab documents — live edits win — plus
   * parsed saved library records): fed to the demo engine so `run.workflow`
   * delegations execute the referenced documents, and to the deployment bundle
   * so it can ship them. The runtime snapshots them per run; the bundle
   * rebuilds when the dialog opens.
   */
  const workspaceDocuments = useMemo<WorkflowDocument[]>(
    () =>
      collectWorkspaceDocuments(
        tabDocumentsRef.current,
        { id: workflowId, document },
        workflowRecords,
        parseWorkflow,
      ),
    // Task 67: `document` (live state) represents the ACTIVE tab — the ref
    // entry is refreshed by a commit-phase effect, so reading it here could
    // hand same-pass consumers a pre-edit snapshot.
    [workflowRecords, workflowId, document],
  );
  const workflowPersistence = useMemo(
    () => assertWorkflowPersistence(createWorkflowPersistence(window.localStorage, WORKFLOW_LIBRARY_KEY)),
    [],
  );

  const stashActiveTab = useCallback(() => {
    tabDocumentsRef.current.set(workflowId, {
      id: workflowId,
      name: workflowName,
      document,
      specText,
      specFormat,
      positions,
      dirty,
      history,
      future,
    });
  }, [workflowId, workflowName, document, specText, specFormat, positions, dirty, history, future]);

  useEffect(() => {
    tabDocumentsRef.current.set(workflowId, {
      id: workflowId,
      name: workflowName,
      document,
      specText,
      specFormat,
      positions,
      dirty,
      history,
      future,
    });
  }, [workflowId, workflowName, document, specText, specFormat, positions, dirty, history, future]);

  useEffect(() => {
    setOpenTabIds((prev) => (prev.includes(workflowId) ? prev : [...prev, workflowId]));
  }, [workflowId]);

  useEffect(() => {
    window.document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('open-workflow-theme', globalTheme);
  }, [globalTheme]);

  // Post-commit AI sub-flow scaffolding: reuses `handleOpenSubflow` so an
  // existing matching sub-flow tab/library entry is switched to (no duplicate
  // tabs), otherwise the catalog-backed sub-flow is scaffolded in a new tab.
  useEffect(() => {
    if (!aiScaffoldRequest) return;
    const component = getAiComponent(aiScaffoldRequest.kind);
    handleOpenSubflow(component.subflowName, component.subflowNamespace, component.subflowVersion);
    setAiScaffoldRequest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiScaffoldRequest?.requestId]);

  useEffect(() => {
    const protectUnsavedChanges = (event: BeforeUnloadEvent) => {
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

  const persistWorkflowRecords = (nextRecords: WorkflowRecord[]) => {
    workflowPersistence.replace(nextRecords);
    setWorkflowRecords(nextRecords);
  };

  const openWorkflowRecord = (record: WorkflowRecord) => {
    try {
      const parsed = parseWorkflow(record.specification);
      const recordPositions = record.positions || {};
      const flow = createFlowGraph(parsed.document, recordPositions);
      setWorkflowId(record.id);
      setDocument(parsed.document);
      setWorkflowName(parsed.document.document?.name || 'workflow');
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
      setSyntaxError(null);
    } catch (error: unknown) {
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
    (nextDocument: WorkflowDocument, extraPositions: CanvasPositions = {}, replacePositions = false) => {
      try {
        const nextText = serializeWorkflow(nextDocument, specFormat);
        if (JSON.stringify(nextDocument) !== JSON.stringify(document)) rememberCurrent();
        const nextPositions = replacePositions ? extraPositions : { ...positions, ...extraPositions };
        const flow = createFlowGraph(nextDocument, nextPositions);
        setDocument(nextDocument);
        setWorkflowName(nextDocument.document?.name || 'workflow');
        setSpecText(nextText);
        setPositions(nextPositions);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setValidationError(formatGraphIssues(nextDocument));
        setSyntaxError(null);
        setDirty(true);
      } catch (error: unknown) {
        setValidationError(formatError(error));
      }
    },
    [document, positions, rememberCurrent, specFormat, validationError],
  );

  const handleSpecificationChange = (value: string) => {
    setSpecText(value);
    setDirty(true);
    try {
      const parsed = parseWorkflow(value);
      const flow = createFlowGraph(parsed.document, positions);
      if (JSON.stringify(parsed.document) !== JSON.stringify(document)) rememberCurrent();
      setDocument(parsed.document);
      setWorkflowName(parsed.document.document?.name || 'workflow');
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setValidationError(formatGraphIssues(parsed.document));
      setSyntaxError(null);
    } catch (error: unknown) {
      setValidationError(formatError(error));
      setSyntaxError(error);
    }
  };

  const updatePosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      rememberCurrent();
      setPositions((current) => ({ ...current, [id]: position }));
      setLayoutMode('manual');
      setDirty(true);
    },
    [rememberCurrent],
  );

  const restoreSnapshot = useCallback(
    (snapshot: HistorySnapshot) => {
      const flow = createFlowGraph(snapshot.document, snapshot.positions);
      setDocument(snapshot.document);
      setWorkflowName(snapshot.document.document?.name || 'workflow');
      setPositions(snapshot.positions);
      setSpecText(serializeWorkflow(snapshot.document, specFormat));
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
      setValidationError(formatGraphIssues(snapshot.document));
      setSyntaxError(null);
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
    } catch (error: unknown) {
      try {
        workflowPersistence.replace(workflowRecords);
      } catch {
        // Preserve the original error state if the persistence layer is unavailable.
      }
      setWorkflowRecords(workflowRecords);
      setSaveState('error');
      setNotice(`Save failed: ${(error as Error).message || 'local storage is unavailable'}`);
      window.setTimeout(() => setNotice(''), 2400);
      return;
    }
    setSaveState('saved');
    setDirty(false);
    setNotice('Saved locally');
    window.setTimeout(() => setNotice(''), 1800);
  };

  const newWorkflow = () => {
    stashActiveTab();
    const parsed = parseWorkflow(NEW_WORKFLOW);
    const name = uniqueWorkflowName(workflowRecords, parsed.document.document?.name || 'workflow');
    const id = createWorkflowId();
    const nextDocument: WorkflowDocument = {
      ...parsed.document,
      document: { ...parsed.document.document, name },
    };
    setWorkflowId(id);
    setSelectedId(null);
    setWorkflowName(name);
    setHistory([]);
    setFuture([]);
    syncDocument(nextDocument, {}, true);
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const duplicateWorkflow = () => {
    if (validationError) {
      setNotice('Fix validation errors before duplicating');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    stashActiveTab();
    const name = uniqueWorkflowName(workflowRecords, `${document.document?.name || 'workflow'}-copy`);
    const id = createWorkflowId();
    const nextDocument: WorkflowDocument = {
      ...document,
      document: { ...document.document, name },
    };
    setWorkflowId(id);
    setWorkflowName(name);
    setHistory([]);
    setFuture([]);
    syncDocument(nextDocument, positions, true);
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setNotice('Workflow duplicated — save to keep it');
    window.setTimeout(() => setNotice(''), 2200);
  };

  const renameWorkflowTo = (rawName: string) => {
    const name = rawName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!name || name === document.document?.name) {
      setWorkflowName(document.document?.name || 'workflow');
      return;
    }
    if (workflowRecords.some((record) => record.id !== workflowId && record.name === name)) {
      setWorkflowName(document.document?.name || 'workflow');
      setNotice('A workflow with that name already exists');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    const nextDocument: WorkflowDocument = {
      ...document,
      document: { ...document.document, name },
    };
    syncDocument(nextDocument);
  };

  const renameWorkflow = () => {
    renameWorkflowTo(workflowName);
  };

  const deleteWorkflowById = (id: string) => {
    if (id === workflowId) {
      deleteWorkflow();
      return;
    }
    const record = workflowRecords.find((r) => r.id === id);
    const label = record?.name || tabDocumentsRef.current.get(id)?.name || 'workflow';
    if (!window.confirm(`Delete workflow “${label}”?`)) return;
    tabDocumentsRef.current.delete(id);
    const remaining = removeWorkflowRecord(workflowRecords, id);
    persistWorkflowRecords(remaining);
    setOpenTabIds((prev) => (prev.includes(id) ? prev.filter((tabId) => tabId !== id) : prev));
    setNotice(`Deleted ${label}`);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const deleteWorkflow = () => {
    if (!window.confirm(`Delete workflow “${document.document?.name}”?`)) return;
    tabDocumentsRef.current.delete(workflowId);
    const remaining = removeWorkflowRecord(workflowRecords, workflowId);
    if (!remaining.length) {
      const parsed = parseWorkflow(NEW_WORKFLOW);
      const name = uniqueWorkflowName([], parsed.document.document?.name || 'workflow');
      const id = createWorkflowId();
      const nextDocument: WorkflowDocument = {
        ...parsed.document,
        document: { ...parsed.document.document, name },
      };
      setWorkflowId(id);
      setWorkflowName(name);
      syncDocument(nextDocument, {}, true);
      persistWorkflowRecords([]);
      setOpenTabIds([id]);
      return;
    }
    persistWorkflowRecords(remaining);
    openWorkflowRecord(remaining[0]);
  };

  const switchWorkflow = (nextId: string) => {
    if (nextId === workflowId) return;
    setOpenTabIds((prev) => (prev.includes(nextId) ? prev : [...prev, nextId]));
    handleSelectTab(nextId);
  };

  const handleReorderTabs = (draggedId: string, overId: string) => {
    setOpenTabIds((current) => {
      const from = current.indexOf(draggedId);
      const to = current.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  };

  const libraryRows = useMemo<LibraryWorkflowRow[]>(
    () =>
      buildLibraryRows(
        workflowRecords,
        [...tabDocumentsRef.current.values()],
        workflowId,
        workflowName,
        dirty,
        libraryOrder,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowRecords, workflowId, workflowName, dirty, openTabIds, libraryOrder],
  );

  const handleReorderWorkflows = (draggedId: string, overId: string) => {
    if (draggedId === overId) return;
    const next = reorderWorkflowIds(
      libraryRows.map((row) => row.id),
      draggedId,
      overId,
    );
    try {
      window.localStorage.setItem(LIBRARY_ORDER_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
    setLibraryOrder(next);
  };

  const revealActiveWorkflow = useCallback(() => {
    setRevealActiveTick((tick) => tick + 1);
  }, []);

  const handleReorderPaletteGroups = (dragged: string, over: string) => {
    if (dragged === over) return;
    setPaletteGroupOrder((prev) => {
      const current = prev.length ? [...prev] : [...DEFAULT_PALETTE_GROUPS];
      const next = reorderWorkflowIds(current, dragged, over);
      try {
        window.localStorage.setItem(PALETTE_GROUP_ORDER_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  };

  const setWorkflowThemeOverride = useCallback(
    (nextTheme: AppTheme | null) => {
      setWorkflowThemes((prev) => {
        const next = { ...prev };
        if (nextTheme) next[workflowId] = nextTheme;
        else delete next[workflowId];
        try {
          window.localStorage.setItem(WORKFLOW_THEMES_KEY, JSON.stringify(next));
        } catch {
          // Best-effort persistence.
        }
        return next;
      });
    },
    [workflowId],
  );

  const renameWorkflowInLibrary = (id: string, nextName: string) => {
    const clean = nextName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!clean) return;
    if (id === workflowId) {
      renameWorkflowTo(clean);
      return;
    }
    const record = workflowRecords.find((r) => r.id === id);
    const currentName = record?.name || tabDocumentsRef.current.get(id)?.name || '';
    if (clean === currentName) return;
    if (workflowRecords.some((r) => r.id !== id && r.name === clean)) {
      setNotice('A workflow with that name already exists');
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    if (!record) {
      const memory = tabDocumentsRef.current.get(id);
      if (memory) tabDocumentsRef.current.set(id, { ...memory, name: clean });
      setNotice(`Renamed to ${clean}`);
      window.setTimeout(() => setNotice(''), 1800);
      return;
    }
    try {
      const parsed = parseWorkflow(record.specification);
      const updatedDocument: WorkflowDocument = {
        ...parsed.document,
        document: { ...parsed.document.document, name: clean },
      };
      const updated: WorkflowRecord = {
        ...record,
        name: clean,
        specification: serializeWorkflow(updatedDocument, record.format),
        updatedAt: Date.now(),
      };
      persistWorkflowRecords(workflowRecords.map((r) => (r.id === id ? updated : r)));
      const memory = tabDocumentsRef.current.get(id);
      if (memory) tabDocumentsRef.current.set(id, { ...memory, name: clean });
      setNotice(`Renamed to ${clean}`);
      window.setTimeout(() => setNotice(''), 1800);
    } catch {
      setNotice('Could not rename workflow');
      window.setTimeout(() => setNotice(''), 1800);
    }
  };

  const toggleMiniMap = useCallback(() => {
    setCanvasPrefs((prev) => {
      const next = { showMiniMap: !prev.showMiniMap };
      try {
        window.localStorage.setItem(CANVAS_PREFS_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  }, []);

  const zoomCanvas = useCallback((direction: 'in' | 'out' | 'reset') => {
    setZoomRequest({ direction, requestId: Date.now() });
  }, []);

  const handleViewportChange = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      setViewports((prev) => {
        const next = { ...prev, [workflowId]: viewport };
        try {
          window.localStorage.setItem(VIEWPORTS_KEY, JSON.stringify(next));
        } catch {
          // Best-effort persistence.
        }
        return next;
      });
    },
    [workflowId],
  );

  const resetPanelWidths = useCallback(() => {
    const next = { left: 246, right: 340 };
    setPanelWidths(next);
    try {
      window.localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const toggleRailSection = useCallback((section: 'library' | 'palette') => {
    setRailSections((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        window.localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  }, []);

  const togglePaletteGroup = useCallback((group: string) => {
    setRailSections((prev) => {
      const next = {
        ...prev,
        groups: { ...prev.groups, [group]: prev.groups[group] === false },
      };
      try {
        window.localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  }, []);

  // The left rail minimizes to its icon strip when the user collapses the whole
  // rail OR when both accordion sections are collapsed (mirroring the right rail:
  // one component collapsed → strip; all content collapsed → minimized rail).
  const leftRailMinimized = leftRailCollapsed || (!railSections.library && !railSections.palette);

  const collapseLeftRail = useCallback(() => {
    setLeftRailCollapsed(true);
  }, []);

  const expandLeftRail = useCallback(() => {
    setLeftRailCollapsed(false);
    // Reopening from the icon strip restores a usable rail (both sections open).
    setRailSections((prev) => {
      const next = { ...prev, library: true, palette: true };
      try {
        window.localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  }, []);

  const toggleLeftRail = useCallback(() => {
    if (leftRailMinimized) expandLeftRail();
    else collapseLeftRail();
  }, [collapseLeftRail, expandLeftRail, leftRailMinimized]);

  const applyGatewayConfig = useCallback((url: string, token: string) => {
    try {
      if (url) window.localStorage.setItem('open-workflow-gateway-url', url);
      else window.localStorage.removeItem('open-workflow-gateway-url');
      if (token) window.localStorage.setItem('open-workflow-gateway-token', token);
      else window.localStorage.removeItem('open-workflow-gateway-token');
      window.dispatchEvent(new Event('open-workflow:gateway-config-changed'));
      setNotice('Gateway configuration applied');
      window.setTimeout(() => setNotice(''), 1800);
    } catch {
      setNotice('Could not persist gateway configuration');
      window.setTimeout(() => setNotice(''), 1800);
    }
  }, []);

  const exportSettingsProfile = useCallback(() => {
    const profile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      theme,
      showMiniMap: canvasPrefs.showMiniMap,
      panelWidths,
      railSections,
      leftRailCollapsed,
      inspectorCollapsed,
      runtimeOpen,
      // Bearer tokens are intentionally excluded from profiles (secret).
      gatewayUrl: window.localStorage.getItem('open-workflow-gateway-url') || '',
    };
    try {
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = 'open-workflow-settings-profile.json';
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('Settings profile exported');
    } catch {
      setNotice('Could not export settings profile');
    }
    window.setTimeout(() => setNotice(''), 1800);
  }, [theme, canvasPrefs, panelWidths, railSections, leftRailCollapsed, inspectorCollapsed, runtimeOpen]);

  const importSettingsProfile = useCallback((json: string) => {
    try {
      const profile = JSON.parse(json) as SettingsProfile;
      if (!profile || typeof profile !== 'object') throw new Error('invalid');

      if (profile.theme === 'light' || profile.theme === 'dark' || profile.theme === 'high-contrast') {
        setGlobalTheme(profile.theme);
      }
      if (typeof profile.showMiniMap === 'boolean') {
        setCanvasPrefs({ showMiniMap: profile.showMiniMap });
        window.localStorage.setItem(CANVAS_PREFS_KEY, JSON.stringify({ showMiniMap: profile.showMiniMap }));
      }
      if (
        profile.panelWidths &&
        typeof profile.panelWidths.left === 'number' &&
        Number.isFinite(profile.panelWidths.left) &&
        typeof profile.panelWidths.right === 'number' &&
        Number.isFinite(profile.panelWidths.right)
      ) {
        const widths = {
          left: Math.round(profile.panelWidths.left),
          right: Math.round(profile.panelWidths.right),
        };
        setPanelWidths(widths);
        window.localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(widths));
      }
      if (
        profile.railSections &&
        typeof profile.railSections === 'object' &&
        typeof profile.railSections.library === 'boolean' &&
        typeof profile.railSections.palette === 'boolean'
      ) {
        const sections = {
          library: profile.railSections.library,
          palette: profile.railSections.palette,
          groups:
            profile.railSections.groups && typeof profile.railSections.groups === 'object'
              ? profile.railSections.groups
              : {},
        };
        setRailSections(sections);
        window.localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(sections));
      }
      if (typeof profile.leftRailCollapsed === 'boolean') setLeftRailCollapsed(profile.leftRailCollapsed);
      if (typeof profile.inspectorCollapsed === 'boolean') setInspectorCollapsed(profile.inspectorCollapsed);
      if (typeof profile.runtimeOpen === 'boolean') setRuntimeOpen(profile.runtimeOpen);
      if (typeof profile.gatewayUrl === 'string') {
        if (profile.gatewayUrl) window.localStorage.setItem('open-workflow-gateway-url', profile.gatewayUrl);
        else window.localStorage.removeItem('open-workflow-gateway-url');
        window.dispatchEvent(new Event('open-workflow:gateway-config-changed'));
      }
      setNotice('Settings profile applied');
    } catch {
      setNotice('Invalid settings profile');
    }
    window.setTimeout(() => setNotice(''), 1800);
  }, []);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const next = duplicateTopLevelTask(document, selectedId);
    if (next !== document) syncDocument(next);
  }, [document, selectedId, syncDocument]);

  const selectedTaskIds = useMemo(() => {
    return nodes
      .filter((node) => node.type === 'task' && (node as unknown as { selected?: boolean }).selected)
      .map((node) => node.id);
  }, [nodes]);

  /** Bulk duplicate for canvas multi-selection (reverse order keeps indices stable). */
  const duplicateSelectedTasks = useCallback(() => {
    if (!selectedTaskIds.length) return;
    const indexOf = (current: WorkflowDocument, id: string) => {
      const name = id.replace('/do/', '');
      return (current.do ?? []).findIndex((item) => Object.hasOwn(item, name));
    };
    const ordered = [...selectedTaskIds].sort((a, b) => indexOf(document, b) - indexOf(document, a));
    let next = document;
    const createdIds: string[] = [];
    ordered.forEach((id) => {
      const candidate = duplicateTopLevelTask(next, id);
      if (candidate === next) return;
      next = candidate;
      const createdName = Object.keys((candidate.do ?? [])[candidate.do!.length - 1] || {})[0];
      if (createdName) createdIds.push(`/do/${createdName}`);
    });
    if (next !== document) {
      syncDocument(next);
      setNodes((current) => current.map((node) => ({ ...node, selected: createdIds.includes(node.id) })));
      setSelectedId(createdIds[0] || null);
    }
  }, [document, selectedTaskIds, syncDocument]);

  /** Bulk delete for canvas multi-selection. */
  const deleteSelectedTasks = useCallback(() => {
    if (!selectedTaskIds.length) return;
    let next = document;
    selectedTaskIds.forEach((id) => {
      next = removeTopLevelTask(next, id);
    });
    if (next !== document) syncDocument(next);
    setSelectedId(null);
  }, [document, selectedTaskIds, syncDocument]);

  const addPaletteTask = (taskType: TaskType) => {
    const paletteItem = paletteItems.find((item) => item.type === taskType);
    if (paletteItem?.comingSoon) {
      setNotice(`“${paletteItem.label}” is coming soon — it cannot be added yet`);
      window.setTimeout(() => setNotice(''), 2200);
      return;
    }
    // AI entries compose from valid primitives: a `run.workflow` delegation task
    // plus a scaffolded catalog-backed AI sub-flow in a new tab. The scaffold
    // runs in a post-commit effect so the parent tab is stashed with the new
    // task included (a setTimeout would capture a stale document).
    try {
      const aiKind = taskType as AiTaskKind;
      const component = getAiComponent(aiKind);
      const next = addTopLevelAiTask(document, aiKind);
      const createdName = Object.keys(next.do?.[next.do.length - 1] || {})[0];
      setSelectedId(`/do/${createdName}`);
      syncDocument(next);
      setAiScaffoldRequest({ kind: aiKind, requestId: aiScaffoldRequestSequenceRef.current!() });
      setNotice(`Added ${component.label} — scaffolding ${component.subflowName} sub-flow`);
      window.setTimeout(() => setNotice(''), 2400);
      return;
    } catch {
      // Not an AI component — fall through to generic task add.
    }
    const next = addTopLevelTask(document, taskType);
    const createdName = Object.keys(next.do?.[next.do.length - 1] || {})[0];
    setSelectedId(`/do/${createdName}`);
    syncDocument(next);
  };

  const handleRunStatusChange = useCallback((status: Record<string, unknown> | null) => {
    if (!status) {
      setExecutionStatusMap({});
      return;
    }
    const nextMap: Record<string, 'running' | 'success' | 'failed' | 'waiting'> = {};
    const trace = Array.isArray(status.trace) ? status.trace : [];
    trace.forEach((step: unknown) => {
      const stepName = typeof step === 'string' ? step : (step as { task?: string })?.task;
      if (stepName) nextMap[stepName] = 'success';
    });

    const currentTask = status.currentTask as string | undefined;
    const state = status.state as string | undefined;
    if (currentTask) {
      if (state === 'running') nextMap[currentTask] = 'running';
      else if (state === 'failed') nextMap[currentTask] = 'failed';
      else if (state === 'completed') nextMap[currentTask] = 'success';
    }
    setExecutionStatusMap(nextMap);
  }, []);

  const handleSelectTemplate = useCallback(
    (template: WorkflowTemplate) => {
      try {
        stashActiveTab();
        const parsed = parseWorkflow(template.specification);
        const name = uniqueWorkflowName(workflowRecords, template.id);
        const id = createWorkflowId();
        const nextDocument: WorkflowDocument = {
          ...parsed.document,
          document: { ...parsed.document.document, name },
        };
        setWorkflowId(id);
        setWorkflowName(name);
        setHistory([]);
        setFuture([]);
        syncDocument(nextDocument, {}, true);
        setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setNotice(`Loaded template: ${template.title}`);
        window.setTimeout(() => setNotice(''), 2200);
      } catch (err) {
        setNotice(`Failed to load template: ${formatError(err)}`);
        window.setTimeout(() => setNotice(''), 2200);
      }
    },
    [workflowRecords, syncDocument, stashActiveTab],
  );

  const handleRestoreRevision = useCallback(
    (revision: WorkflowRevision) => {
      try {
        const parsed = parseWorkflow(revision.specification);
        syncDocument(parsed.document, positions, true);
        setNotice('Restored revision');
        window.setTimeout(() => setNotice(''), 2200);
      } catch (err) {
        setNotice(`Failed to restore revision: ${formatError(err)}`);
        window.setTimeout(() => setNotice(''), 2200);
      }
    },
    [positions, syncDocument],
  );

  const tabItems = useMemo(() => {
    return openTabIds.map((tabId) => {
      if (tabId === workflowId) {
        return {
          id: tabId,
          name: workflowName,
          isDirty: dirty,
        };
      }
      const inMemory = tabDocumentsRef.current.get(tabId);
      if (inMemory) {
        return {
          id: tabId,
          name: inMemory.name,
          isDirty: inMemory.dirty,
        };
      }
      const record = workflowRecords.find((r) => r.id === tabId);
      const example = SMART_CITY_WORKFLOWS.find((e) => e.id === tabId);
      const title = record?.name || example?.label || 'workflow';
      return {
        id: tabId,
        name: title,
        isDirty: false,
      };
    });
  }, [openTabIds, workflowId, workflowName, dirty, workflowRecords]);

  const handleSelectTab = useCallback(
    (id: string) => {
      if (id === workflowId) return;
      stashActiveTab();

      const inMemory = tabDocumentsRef.current.get(id);
      if (inMemory) {
        const flow = createFlowGraph(inMemory.document, inMemory.positions);
        setWorkflowId(inMemory.id);
        setDocument(inMemory.document);
        setWorkflowName(inMemory.name);
        setSpecFormat(inMemory.specFormat);
        setSpecText(inMemory.specText);
        setPositions(inMemory.positions);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setSelectedId(null);
        setValidationError(formatGraphIssues(inMemory.document));
        setHistory(inMemory.history || []);
        setFuture(inMemory.future || []);
        setLayoutMode('manual');
        setIsHydrating(false);
        setDirty(inMemory.dirty);
        setSyntaxError(null);
        return;
      }

      const record = workflowRecords.find((r) => r.id === id);
      if (record) {
        openWorkflowRecord(record);
      }
    },
    [workflowId, stashActiveTab, workflowRecords],
  );

  const handleCloseTab = (id: string) => {
    tabDocumentsRef.current.delete(id);
    const nextTabs = openTabIds.filter((t) => t !== id);
    if (id === workflowId) {
      if (nextTabs.length > 0) {
        const targetId = nextTabs[nextTabs.length - 1];
        setOpenTabIds(nextTabs);
        handleSelectTab(targetId);
        return;
      } else {
        newWorkflow();
        return;
      }
    }
    setOpenTabIds(nextTabs.length ? nextTabs : [workflowId]);
  };

  const handleOpenFileContent = useCallback(
    (content: string, filename: string) => {
      try {
        stashActiveTab();
        const parsed = parseWorkflow(content);
        const name = uniqueWorkflowName(workflowRecords, parsed.document.document?.name || filename);
        const id = createWorkflowId();
        const nextDocument: WorkflowDocument = {
          ...parsed.document,
          document: { ...parsed.document.document, name },
        };
        setWorkflowId(id);
        setWorkflowName(name);
        setSpecFormat(filename.endsWith('.json') ? 'json' : 'yaml');
        setHistory([]);
        setFuture([]);
        syncDocument(nextDocument, {}, true);
        setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setNotice(`Imported file: ${filename}`);
        window.setTimeout(() => setNotice(''), 2200);
      } catch (err) {
        setNotice(`Failed to parse file: ${formatError(err)}`);
        window.setTimeout(() => setNotice(''), 2200);
      }
    },
    [workflowRecords, stashActiveTab, syncDocument],
  );

  const handleOpenFile = async () => {
    const res = await openWorkflowFile();
    if (!res) return;
    handleOpenFileContent(res.content, res.filename);
  };

  const handleSaveFile = async () => {
    try {
      const savedName = await saveWorkflowFile(specText, workflowName, specFormat);
      if (savedName) {
        setNotice(`Saved file: ${savedName}`);
        window.setTimeout(() => setNotice(''), 2200);
      }
    } catch (err) {
      setNotice(`Failed to save file: ${formatError(err)}`);
      window.setTimeout(() => setNotice(''), 2200);
    }
  };

  const handleOpenSubflow = useCallback(
    (name: string, namespace = 'dubai-government', version = '1.0.0') => {
      // Same-name sub-flows in different namespaces are distinct documents:
      // match strictly on the caller's namespace (Task 66). Only a
      // caller-undefined namespace falls back to name-only matching for
      // legacy entries; candidates whose namespace cannot be verified —
      // missing field or unparsable specification — are excluded.
      const matchingTab = findMatchingSubflowTab({
        tabIds: openTabIds,
        activeTabId: workflowId,
        activeTab: { name: workflowName, document },
        tabMemories: tabDocumentsRef.current,
        records: workflowRecords,
        target: { name, namespace },
        parseWorkflowSpec: parseWorkflow,
      });
      if (matchingTab) {
        handleSelectTab(matchingTab);
        setNotice(`Switched to tab: ${name}`);
        window.setTimeout(() => setNotice(''), 2200);
        return;
      }

      stashActiveTab();
      const existing = workflowRecords.find((record) =>
        subflowRecordMatchesTarget(record, { name, namespace }, parseWorkflow),
      );
      if (existing) {
        setOpenTabIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
        openWorkflowRecord(existing);
        setNotice(`Opened sub-flow: ${existing.name}`);
        window.setTimeout(() => setNotice(''), 2200);
        return;
      }
      // AI sub-flows scaffold from their catalog-backed document builder.
      const aiComponent = findAiComponentBySubflow(namespace, name);
      const subflowSpec = aiComponent
        ? serializeWorkflow(createAiSubflowDocument(aiComponent.kind), 'yaml')
        : `document:
  dsl: "1.0.3"
  namespace: "${namespace}"
  name: "${name}"
  version: "${version}"
do:
  - initSubflow:
      set:
        subflowReady: true
`;
      try {
        const parsed = parseWorkflow(subflowSpec);
        const id = createWorkflowId();
        const nextDocument = parsed.document;
        setWorkflowId(id);
        setWorkflowName(name);
        setHistory([]);
        setFuture([]);
        syncDocument(nextDocument, {}, true);
        setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setNotice(`Scaffolded sub-flow: ${name}`);
        window.setTimeout(() => setNotice(''), 2200);
      } catch (err) {
        setNotice(`Failed to scaffold sub-flow: ${formatError(err)}`);
        window.setTimeout(() => setNotice(''), 2200);
      }
    },
    [
      openTabIds,
      workflowId,
      workflowName,
      workflowRecords,
      stashActiveTab,
      handleSelectTab,
      openWorkflowRecord,
      syncDocument,
    ],
  );

  const formatSpec = () => {
    try {
      const parsed = parseWorkflow(specText);
      setSpecText(serializeWorkflow(parsed.document, specFormat));
      setValidationError(formatGraphIssues(parsed.document));
      setSyntaxError(null);
    } catch (error: unknown) {
      setValidationError(formatError(error));
      setSyntaxError(error);
    }
  };

  const changeSpecFormat = (format: WorkflowFormat) => {
    try {
      const parsed = parseWorkflow(specText);
      setSpecFormat(format);
      setSpecText(serializeWorkflow(parsed.document, format));
      setValidationError(formatGraphIssues(parsed.document));
      setSyntaxError(null);
    } catch (error: unknown) {
      setValidationError(formatError(error));
      setSyntaxError(error);
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
    anchor.download = `${document.document?.name || 'workflow'}.${extension}`;
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

  const importSpec = (event: ChangeEvent<HTMLInputElement>) => {
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
  const selectedTaskName = selected?.name || null;
  const breadcrumbSegments = useMemo(() => {
    const segments = getBreadcrumbPath(document, selectedId);
    // The root `do` container is always part of the chain, even before a task
    // is selected.
    return segments.length > 0 ? segments : [{ label: 'do', taskId: null }];
  }, [document, selectedId]);
  const graphIssues = useMemo(() => (syntaxError ? [] : validateGraph(document)), [document, syntaxError]);
  const subflowIssues = useMemo(
    () => detectMissingSubflowReferences(document, workspaceDocuments),
    [document, workspaceDocuments],
  );
  const specDiagnostics = useMemo<SpecDiagnostic[]>(
    () => collectSpecDiagnostics(specText, specFormat, syntaxError, graphIssues),
    [specText, specFormat, syntaxError, graphIssues],
  );

  const updatePanelWidth = useCallback((side: 'left' | 'right', width: number) => {
    const min = side === 'left' ? 200 : 260;
    const max = side === 'left' ? 420 : 560;
    const clamped = Math.round(Math.min(max, Math.max(min, width)));
    setPanelWidths((prev) => {
      const next = { ...prev, [side]: clamped };
      try {
        window.localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(next));
      } catch {
        // Width persistence is best-effort.
      }
      return next;
    });
  }, []);

  const requestTaskDelete = () => {
    if (selected) setTaskDeleteRequest({ id: selectedId!, name: selected.name });
  };
  const confirmTaskDelete = () => {
    if (!taskDeleteRequest) return;
    const next = removeTopLevelTask(document, taskDeleteRequest.id);
    if (next !== document) syncDocument(next);
    setSelectedId(null);
    setTaskDeleteRequest(null);
  };

  const copyTaskYaml = useCallback(
    (nodeId: string) => {
      const task = getTopLevelTask(document, nodeId);
      if (!task) return;
      const payload = { [task.name]: task.task };
      const text = specFormat === 'json' ? JSON.stringify(payload, null, 2) : yamlDump(payload);
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setNotice('Copied task definition');
          window.setTimeout(() => setNotice(''), 1800);
        })
        .catch(() => {
          setNotice('Clipboard unavailable');
          window.setTimeout(() => setNotice(''), 1800);
        });
    },
    [document, specFormat],
  );

  const copyWorkflowYaml = useCallback(() => {
    const text = specFormat === 'json' ? JSON.stringify(document, null, 2) : yamlDump(document);
    void navigator.clipboard.writeText(text).then(() => {
      setNotice('Copied workflow definition');
      window.setTimeout(() => setNotice(''), 1800);
    });
  }, [document, specFormat]);

  const handleTabContextMenu = useCallback(
    (id: string, name: string, x: number, y: number) => {
      setContextMenu({
        x,
        y,
        title: name,
        items: [
          {
            id: 'tab-open',
            label: 'Open',
            icon: '📄',
            onSelect: () => handleSelectTab(id),
          },
          {
            id: 'tab-save',
            label: 'Save',
            hint: 'Ctrl+S',
            icon: '💾',
            disabled: !(id === workflowId && dirty),
            onSelect: () => {
              if (id === workflowId) void save();
            },
          },
          {
            id: 'tab-close',
            label: 'Close tab',
            icon: '×',
            onSelect: () => handleCloseTab(id),
          },
          {
            id: 'tab-close-others',
            label: 'Close others',
            icon: '✕',
            onSelect: () => closeTabOthers(id),
          },
          {
            id: 'tab-close-all',
            label: 'Close all tabs',
            icon: '✕✕',
            onSelect: closeAllTabs,
          },
        ],
      });
    },
    [dirty, handleCloseTab, handleSelectTab, save, workflowId],
  );

  const handleNodeContextMenu = useCallback(
    (node: FlowNode, x: number, y: number) => {
      const nodeName = String(node.id).replace('/do/', '');
      const multiCount = selectedTaskIds.length;
      if (multiCount > 1) {
        setContextMenu({
          x,
          y,
          title: `${multiCount} tasks selected`,
          items: [
            {
              id: 'node-duplicate-many',
              label: `Duplicate ${multiCount} tasks`,
              icon: '⧉',
              onSelect: duplicateSelectedTasks,
            },
            {
              id: 'node-delete-many',
              label: `Delete ${multiCount} tasks`,
              icon: '✕',
              danger: true,
              onSelect: deleteSelectedTasks,
            },
          ],
        });
        return;
      }
      setContextMenu({
        x,
        y,
        title: nodeName,
        items: [
          {
            id: 'node-inspect',
            label: 'Select in inspector',
            icon: '☰',
            onSelect: () => {
              setSelectedId(node.id);
            },
          },
          {
            id: 'node-duplicate',
            label: 'Duplicate task',
            hint: 'Ctrl+D',
            icon: '⧉',
            onSelect: () => {
              setSelectedId(node.id);
              duplicateSelected();
            },
          },
          {
            id: 'node-copy-yaml',
            label: 'Copy task YAML',
            icon: '⧉',
            onSelect: () => copyTaskYaml(node.id),
          },
          {
            id: 'node-delete',
            label: 'Delete task',
            icon: '✕',
            danger: true,
            onSelect: () => {
              setSelectedId(node.id);
              requestTaskDelete();
            },
          },
        ],
      });
    },
    [
      copyTaskYaml,
      deleteSelectedTasks,
      duplicateSelected,
      duplicateSelectedTasks,
      requestTaskDelete,
      selectedTaskIds,
    ],
  );

  const handlePaneContextMenu = useCallback(
    (x: number, y: number) => {
      const taskNodes = nodes.filter((n) => n.type === 'task');
      setContextMenu({
        x,
        y,
        title: 'Canvas',
        items: [
          {
            id: 'pane-fit',
            label: 'Fit view',
            hint: 'F',
            icon: '⌖',
            onSelect: () => setFitViewRequest((v) => v + 1),
          },
          {
            id: 'pane-layout',
            label: 'Auto layout workflow',
            icon: '⬒',
            onSelect: () => {
              void autoLayout();
            },
          },
          { id: 'pane-copy', label: 'Copy workflow YAML', icon: '⧉', onSelect: copyWorkflowYaml },
          {
            id: 'pane-problems',
            label: 'Toggle problems panel',
            hint: 'Ctrl+Shift+M',
            icon: '⚑',
            onSelect: () => setProblemsOpen((prev) => !prev),
          },
          {
            id: 'pane-add-note',
            label: 'Add task…',
            icon: '＋',
            disabled: taskNodes.length === 0,
            onSelect: () => setCommandPaletteOpen(true),
          },
        ],
      });
    },
    [autoLayout, copyWorkflowYaml, nodes],
  );

  const closeTabOthers = useCallback(
    (keepId: string) => {
      const keep = new Set([workflowId, keepId]);
      const nextTabs = openTabIds.filter((tabId) => keep.has(tabId));
      tabDocumentsRef.current.forEach((_, key) => {
        if (!keep.has(key)) tabDocumentsRef.current.delete(key);
      });
      setOpenTabIds(nextTabs.length ? nextTabs : [workflowId]);
    },
    [openTabIds, workflowId],
  );

  const closeAllTabs = useCallback(() => {
    tabDocumentsRef.current.clear();
    setOpenTabIds([workflowId]);
  }, [workflowId]);
  // The right rail collapses to an icon strip when BOTH of its components
  // (Inspector + Runtime console) are collapsed — independently of the left rail.
  const rightRailCollapsed = inspectorCollapsed && !runtimeOpen;
  const allPanelsCollapsed = leftRailMinimized && rightRailCollapsed;
  const toggleAllPanels = () => {
    const nextCollapsed = !allPanelsCollapsed;
    setLeftRailCollapsed(nextCollapsed);
    setInspectorCollapsed(nextCollapsed);
    setRuntimeOpen(!nextCollapsed);
    if (!nextCollapsed) {
      // Expanding from focus mode restores a usable left rail.
      setRailSections((prev) => {
        const next = { ...prev, library: true, palette: true };
        try {
          window.localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next));
        } catch {
          // Best-effort persistence.
        }
        return next;
      });
    }
  };

  const quickOpenItems = useMemo<QuickOpenItem[]>(() => {
    const items: QuickOpenItem[] = [];
    openTabIds.forEach((tabId) => {
      const tab = tabItems.find((entry) => entry.id === tabId);
      items.push({
        id: tabId,
        label: tab?.name || tabId,
        meta: 'open tab',
        icon: '📄',
        dirty: tab?.isDirty,
        onSelect: () => switchWorkflow(tabId),
      });
    });
    workflowRecords.forEach((record) => {
      if (openTabIds.includes(record.id)) return;
      items.push({
        id: record.id,
        label: record.name,
        meta: 'library',
        icon: '⬡',
        onSelect: () => switchWorkflow(record.id),
      });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabIds, tabItems, workflowRecords]);

  const openWorkflowForSearch = useCallback(
    (targetWorkflowId: string, taskName: string) => {
      if (targetWorkflowId !== workflowId) switchWorkflow(targetWorkflowId);
      setView('canvas');
      setCanvasSearchRequest({ term: taskName, requestId: Date.now() });
    },
    [switchWorkflow, workflowId],
  );

  const workspaceSearchIndex = useMemo<WorkspaceSearchItem[]>(() => {
    const items: WorkspaceSearchItem[] = [];
    const pushWorkflow = (workflowIdToIndex: string, workflowNameToIndex: string, specification: string) => {
      try {
        const parsed = parseWorkflow(specification);
        const doList = parsed.document.do || [];
        doList.forEach((item) => {
          const taskName = Object.keys(item)[0];
          const taskDef = item[taskName];
          const taskType = Object.keys(taskDef || {})[0] || 'task';
          items.push({
            id: `${workflowIdToIndex}:${taskName}`,
            workflowId: workflowIdToIndex,
            workflowName: workflowNameToIndex,
            taskName,
            taskType,
            onOpen: () => openWorkflowForSearch(workflowIdToIndex, taskName),
          });
        });
      } catch {
        // Unparsable drafts are skipped in workspace search.
      }
    };
    const covered = new Set(workflowRecords.map((record) => record.id));
    workflowRecords.forEach((record) => pushWorkflow(record.id, record.name, record.specification));
    if (!covered.has(workflowId)) pushWorkflow(workflowId, workflowName, specText);
    tabDocumentsRef.current.forEach((memory) => {
      if (!covered.has(memory.id) && memory.id !== workflowId) {
        pushWorkflow(memory.id, memory.name, memory.specText);
      }
    });
    return items;
  }, [openWorkflowForSearch, specText, workflowId, workflowName, workflowRecords]);

  /**
   * Select a task from outside the canvas (problems panel, breadcrumbs, quick
   * open, …): opens the Inspector AND highlights the node on the canvas
   * (`selected` flag mirrors what a direct canvas click produces).
   */
  const selectTaskOnCanvas = useCallback((id: string) => {
    setView('canvas');
    setSelectedId(id);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
  }, []);

  const problemItems = useMemo<ProblemItem[]>(() => {
    const items: ProblemItem[] = [];
    if (syntaxError) {
      collectSpecDiagnostics(specText, specFormat, syntaxError, []).forEach((diagnostic, index) => {
        items.push({
          id: `schema-${index}`,
          message: diagnostic.message,
          path: diagnostic.path || `spec:${diagnostic.line + 1}`,
          severity: 'error',
          kind: 'schema',
          line: diagnostic.line,
          onSelect: () => {
            setView('spec');
            setSpecJump({ line: diagnostic.line, column: diagnostic.column, requestId: Date.now() });
          },
        });
      });
      return items;
    }
    graphIssues.forEach((issue, index) => {
      const targetMatch = /^\/do\/([^/]+)/.exec(issue.path);
      const targetId = targetMatch ? `/do/${targetMatch[1]}` : null;
      if (!targetId) return;
      items.push({
        id: `graph-${index}`,
        message: issue.message,
        path: issue.path,
        severity: 'warning',
        kind: 'graph',
        onSelect: () => {
          selectTaskOnCanvas(targetId);
        },
      });
    });
    subflowIssues.forEach((issue, index) => {
      const targetMatch = /^\/do\/([^/]+)/.exec(issue.path);
      const targetId = targetMatch ? `/do/${targetMatch[1]}` : null;
      if (!targetId) return;
      items.push({
        id: `subflow-${index}`,
        message: issue.message,
        path: issue.path,
        severity: 'warning',
        kind: 'subflow',
        action: issue.subflowTarget
          ? {
              label: 'Scaffold',
              onAction: () => handleOpenSubflow(issue.subflowTarget!.name, issue.subflowTarget!.namespace),
            }
          : undefined,
        onSelect: () => {
          selectTaskOnCanvas(targetId);
        },
      });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphIssues, subflowIssues, specDiagnostics, specFormat, specText, syntaxError]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: 'file-new',
        label: 'New workflow',
        hint: 'Ctrl+Alt+N',
        section: 'File',
        icon: '＋',
        run: newWorkflow,
      },
      {
        id: 'file-open',
        label: 'Open workflow file…',
        hint: 'Ctrl+O',
        section: 'File',
        icon: '📂',
        run: () => void handleOpenFile(),
      },
      {
        id: 'file-save',
        label: 'Save workflow',
        hint: 'Ctrl+S',
        section: 'File',
        icon: '💾',
        disabled: !dirty || saveState === 'saving',
        run: () => void save(),
      },
      {
        id: 'file-save-disk',
        label: 'Save file to disk…',
        section: 'File',
        icon: '⬇',
        run: () => void handleSaveFile(),
      },
      { id: 'file-export', label: 'Export specification', section: 'File', icon: '⬇', run: exportSpec },
      {
        id: 'file-copy',
        label: 'Copy specification to clipboard',
        section: 'File',
        icon: '⧉',
        run: copySpec,
      },
      {
        id: 'file-deploy',
        label: 'Generate deployment bundle…',
        section: 'File',
        icon: '📦',
        run: () => setShowDeploymentBundle(true),
      },

      {
        id: 'edit-undo',
        label: 'Undo',
        hint: 'Ctrl+Z',
        section: 'Edit',
        icon: '↶',
        disabled: !history.length,
        run: undo,
      },
      {
        id: 'edit-redo',
        label: 'Redo',
        hint: 'Ctrl+Shift+Z',
        section: 'Edit',
        icon: '↷',
        disabled: !future.length,
        run: redo,
      },
      { id: 'edit-format', label: 'Format specification', section: 'Edit', icon: '⌘', run: formatSpec },
      {
        id: 'edit-validate',
        label: 'Validate workflow',
        section: 'Edit',
        icon: '✓',
        run: validateWorkflowDefinition,
      },

      ...paletteItems.map((item) => ({
        id: `task-add-${item.type}`,
        label: `Add ${item.label} task`,
        section: item.group,
        icon: item.icon,
        disabled: item.comingSoon,
        hint: item.comingSoon ? 'Coming soon' : undefined,
        run: () => addPaletteTask(item.type),
      })),
      {
        id: 'task-duplicate',
        label: 'Duplicate selected task',
        hint: 'Ctrl+D',
        section: 'Tasks',
        icon: '⧉',
        disabled: !selectedId,
        run: duplicateSelected,
      },
      {
        id: 'task-delete',
        label: 'Delete selected task',
        section: 'Tasks',
        icon: '✕',
        danger: true,
        disabled: !selectedId,
        run: requestTaskDelete,
      },

      { id: 'view-canvas', label: 'Show canvas', section: 'View', icon: '⬒', run: () => setView('canvas') },
      {
        id: 'view-spec',
        label: 'Show specification editor',
        section: 'View',
        icon: '☰',
        run: () => setView('spec'),
      },
      {
        id: 'view-palette-toggle',
        label: 'Toggle task palette rail',
        section: 'View',
        icon: '▦',
        run: toggleLeftRail,
      },
      {
        id: 'view-inspector-toggle',
        label: 'Toggle inspector rail',
        section: 'View',
        icon: '☰',
        run: () => setInspectorCollapsed((current) => !current),
      },
      {
        id: 'view-runtime-toggle',
        label: 'Toggle runtime console',
        section: 'View',
        icon: '▶',
        run: () => setRuntimeOpen((current) => !current),
      },
      {
        id: 'view-focus-mode',
        label: 'Collapse / expand all panels',
        hint: 'Ctrl+Shift+L',
        section: 'View',
        icon: '⇥',
        run: toggleAllPanels,
      },
      {
        id: 'view-problems',
        label: 'Toggle problems panel',
        hint: 'Ctrl+Shift+M',
        section: 'View',
        icon: '⚑',
        run: () => setProblemsOpen((current) => !current),
      },
      {
        id: 'view-layout',
        label: 'Auto layout workflow',
        section: 'View',
        icon: '⬒',
        run: () => void autoLayout(),
      },
      {
        id: 'view-fit',
        label: 'Fit canvas view',
        hint: 'F',
        section: 'View',
        icon: '⌖',
        run: () => {
          setView('canvas');
          setFitViewRequest((current) => current + 1);
        },
      },
      {
        id: 'view-zoom-in',
        label: 'Zoom in canvas',
        hint: 'Ctrl+=',
        section: 'View',
        icon: '＋',
        run: () => {
          setView('canvas');
          zoomCanvas('in');
        },
      },
      {
        id: 'view-zoom-out',
        label: 'Zoom out canvas',
        hint: 'Ctrl+-',
        section: 'View',
        icon: '−',
        run: () => {
          setView('canvas');
          zoomCanvas('out');
        },
      },
      {
        id: 'view-zoom-reset',
        label: 'Reset canvas zoom',
        hint: 'Ctrl+0',
        section: 'View',
        icon: '◎',
        run: () => {
          setView('canvas');
          zoomCanvas('reset');
        },
      },
      {
        id: 'view-minimap',
        label: 'Toggle mini-map on canvas',
        section: 'View',
        icon: '▣',
        run: toggleMiniMap,
      },
      {
        id: 'view-reset-panel-widths',
        label: 'Reset panel widths to defaults',
        section: 'View',
        icon: '⇌',
        run: resetPanelWidths,
      },

      {
        id: 'wf-duplicate',
        label: 'Duplicate workflow',
        section: 'Workflow',
        icon: '⧉',
        run: duplicateWorkflow,
      },
      {
        id: 'wf-delete',
        label: 'Delete workflow',
        section: 'Workflow',
        icon: '✕',
        danger: true,
        run: deleteWorkflow,
      },
      {
        id: 'wf-quickopen',
        label: 'Quick open workflow…',
        hint: 'Ctrl+P',
        section: 'Workflow',
        icon: '⌕',
        run: () => {
          setQuickOpenMode('files');
          setQuickOpenOpen(true);
        },
      },
      {
        id: 'wf-search',
        label: 'Search tasks across workflows…',
        hint: 'Ctrl+Shift+F',
        section: 'Workflow',
        icon: '🔎',
        run: () => {
          setQuickOpenMode('search');
          setQuickOpenOpen(true);
        },
      },
      ...workflowRecords.slice(0, 10).map((record) => ({
        id: `wf-open-${record.id}`,
        label: `Open workflow: ${record.name}`,
        section: 'Workflows',
        icon: '⬡',
        run: () => switchWorkflow(record.id),
      })),

      {
        id: 'settings-open',
        label: 'Open settings…',
        hint: 'Ctrl+,',
        section: 'Settings',
        icon: '⚙',
        run: () => setShowSettings(true),
      },
      {
        id: 'theme-light',
        label: 'Theme: Light',
        section: 'Settings',
        icon: '☀',
        run: () => setGlobalTheme('light'),
      },
      {
        id: 'theme-dark',
        label: 'Theme: Dark',
        section: 'Settings',
        icon: '🌙',
        run: () => setGlobalTheme('dark'),
      },
      {
        id: 'theme-contrast',
        label: 'Theme: High contrast',
        section: 'Settings',
        icon: '👁',
        run: () => setGlobalTheme('high-contrast'),
      },
      {
        id: 'theme-clear-override',
        label: 'Clear this workflow’s theme override',
        section: 'Settings',
        icon: '◐',
        disabled: !workflowThemes[workflowId],
        run: () => setWorkflowThemeOverride(null),
      },

      {
        id: 'help-templates',
        label: 'Template library…',
        section: 'Help',
        icon: '📚',
        run: () => setShowTemplates(true),
      },
      {
        id: 'help-history',
        label: 'Revision history…',
        section: 'Help',
        icon: '🕘',
        run: () => setShowHistory(true),
      },
      {
        id: 'help-shortcuts',
        label: 'Keyboard shortcuts',
        hint: '?',
        section: 'Help',
        icon: '⌨',
        run: () => setShowShortcuts(true),
      },
    ];
    return commands;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dirty,
    future.length,
    history.length,
    paletteItems,
    resetPanelWidths,
    saveState,
    selectedId,
    toggleLeftRail,
    toggleMiniMap,
    view,
    workflowRecords,
    zoomCanvas,
  ]);

  useEffect(() => {
    const handleGlobalKeys = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      const nativeInput = tag === 'INPUT' || tag === 'TEXTAREA';
      const inCodeMirror = Boolean(target?.closest?.('.cm-editor'));
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Help dialog (existing affordance, extended to ignore the code editor).
      if ((e.key === '?' && !nativeInput && !inCodeMirror) || e.key === 'F1') {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // Overlay shortcuts — capture phase so CodeMirror / inputs never swallow them.
      if (mod && key === 'p') {
        e.preventDefault();
        if (e.shiftKey) setCommandPaletteOpen((prev) => !prev);
        else {
          setQuickOpenMode('files');
          setQuickOpenSearchQuery('');
          setQuickOpenOpen(true);
        }
        return;
      }
      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        setQuickOpenMode('search');
        setQuickOpenSearchQuery('');
        setQuickOpenOpen(true);
        return;
      }
      if (mod && e.shiftKey && key === 'm') {
        e.preventDefault();
        setProblemsOpen((prev) => !prev);
        return;
      }
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        toggleAllPanels();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        void handleOpenFile();
        return;
      }
      if (mod && key === ',') {
        e.preventDefault();
        setShowSettings(true);
        return;
      }
      // Zoom controls (canvas view only).
      if (mod && view === 'canvas' && (key === '0' || key === '=' || key === '+' || key === '-')) {
        e.preventDefault();
        if (key === '0' && !e.shiftKey) zoomCanvas('reset');
        else if (key === '=' || key === '+') zoomCanvas('in');
        else zoomCanvas('out');
        return;
      }
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (quickOpenOpen) {
          setQuickOpenOpen(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        return;
      }

      // Save / undo / redo: the canvas view owns these via its own window handler,
      // so only act here when the workspace is showing the specification editor.
      if (view === 'canvas') return;
      if (mod && key === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys, true);
    return () => window.removeEventListener('keydown', handleGlobalKeys, true);
  }, [
    commandPaletteOpen,
    contextMenu,
    handleOpenFile,
    quickOpenOpen,
    redo,
    save,
    toggleAllPanels,
    undo,
    view,
    zoomCanvas,
  ]);

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
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowTemplates(true)}
            aria-label="Open template library"
            title="Browse workflow patterns and templates"
          >
            Templates
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowHistory(true)}
            aria-label="Workflow revision history"
            title="View revision history & diffs"
          >
            History
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts reference"
            title="Keyboard shortcuts (?)"
            style={{ padding: '0 8px', minWidth: 32 }}
          >
            ⌨️
          </button>
          <select
            className="theme-select"
            aria-label="Editor visual theme"
            value={globalTheme}
            onChange={(e) => setGlobalTheme(e.target.value as AppTheme)}
            title={
              workflowThemes[workflowId]
                ? `Default theme — this workflow uses an override (see Settings)`
                : 'Default theme for all workflows'
            }
          >
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="high-contrast">👁 Contrast</option>
          </select>
          {workflowThemes[workflowId] && (
            <span
              className="theme-override-dot"
              role="img"
              aria-label="This workflow uses a theme override"
              title="This workflow uses a theme override — clear it in Settings"
            />
          )}
          <span className="avatar" role="img" aria-label="Open Workflow Editor workspace">
            OW
          </span>
        </div>
      </header>
      <div
        className={`editor-layout ${leftRailMinimized ? 'left-rail-collapsed' : ''} ${rightRailCollapsed ? 'right-rail-collapsed' : ''} ${allPanelsCollapsed ? 'all-panels-collapsed' : ''}`}
        style={
          {
            '--left-rail-width': `${panelWidths.left}px`,
            '--right-rail-width': `${panelWidths.right}px`,
          } as CSSProperties
        }
      >
        <Palette
          onNewWorkflow={newWorkflow}
          onAddTask={addPaletteTask}
          collapsed={leftRailMinimized}
          onToggle={toggleLeftRail}
          libraryWorkflows={libraryRows}
          onOpenWorkflow={switchWorkflow}
          onRenameWorkflow={renameWorkflowInLibrary}
          onDeleteWorkflow={deleteWorkflowById}
          libraryExpanded={railSections.library}
          paletteExpanded={railSections.palette}
          onToggleLibrary={() => toggleRailSection('library')}
          onTogglePalette={() => toggleRailSection('palette')}
          paletteGroupsExpanded={railSections.groups}
          onTogglePaletteGroup={togglePaletteGroup}
          paletteGroupOrder={paletteGroupOrder}
          onReorderPaletteGroups={handleReorderPaletteGroups}
          onReorderWorkflows={handleReorderWorkflows}
          onRevealActiveWorkflow={revealActiveWorkflow}
          revealRequestId={revealActiveTick}
        />
        <ResizeHandle side="left" onResize={(width) => updatePanelWidth('left', width)} />
        <section className="workspace">
          <DocumentTabs
            tabs={tabItems}
            activeTabId={workflowId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={newWorkflow}
            onOpenFile={handleOpenFile}
            onSaveFile={handleSaveFile}
            onContextMenu={handleTabContextMenu}
            onReorderTabs={handleReorderTabs}
          />
          <div className="workspace-head">
            <div>
              <span className="breadcrumb">
                <span className="breadcrumb-segment">{workflowName}</span>
                {breadcrumbSegments.map((segment, index) => (
                  <Fragment key={`${segment.label}-${index}`}>
                    <span className="breadcrumb-sep">/</span>
                    {segment.taskId ? (
                      <button
                        type="button"
                        className="breadcrumb-segment breadcrumb-task"
                        onClick={() => selectTaskOnCanvas(segment.taskId as string)}
                        title={`Select ${segment.label}`}
                      >
                        {segment.label}
                      </button>
                    ) : (
                      <span className="breadcrumb-segment">{segment.label}</span>
                    )}
                  </Fragment>
                ))}
              </span>
              <div className="workflow-title-row">
                <input
                  className="workflow-name-input"
                  value={workflowName}
                  aria-label="Workflow name"
                  onChange={(event) => setWorkflowName(event.target.value)}
                  onBlur={renameWorkflow}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <span className="workflow-name-status">
                  {workflowRecords.some((record) => record.id === workflowId) ? 'saved' : 'unsaved'}
                </span>
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
              <input
                ref={fileInput}
                type="file"
                accept=".yaml,.yml,.json,text/yaml,application/json"
                onChange={importSpec}
                hidden
              />
              <button
                className="button secondary"
                onClick={() => setShowDeploymentBundle(true)}
                title="Export Docker & Kubernetes deployment bundle"
              >
                Deploy bundle
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
            <button
              type="button"
              className="validation-banner"
              aria-label="Open problems panel"
              onClick={() => setProblemsOpen(true)}
              title="Open the problems panel for details"
            >
              <strong>{validationTitle(validationError)}</strong>
              <span className="validation-banner-summary">{validationError.split('\n')[0]}</span>
              <span className="validation-banner-count">
                {problemItems.length} {problemItems.length === 1 ? 'issue' : 'issues'} · details
              </span>
            </button>
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
                  layoutKey={`${leftRailMinimized ? 'left' : 'full'}-${allPanelsCollapsed ? 'focus' : 'open'}-${layoutMode}-${layoutRevision}`}
                  executionStatusMap={executionStatusMap}
                  theme={theme}
                  onOpenFileContent={handleOpenFileContent}
                  externalSearch={canvasSearchRequest}
                  fitViewRequest={fitViewRequest}
                  zoomRequest={zoomRequest}
                  workflowId={workflowId}
                  initialViewport={viewports[workflowId] || null}
                  onViewportChange={handleViewportChange}
                  showMiniMap={canvasPrefs.showMiniMap}
                  onNodeContextMenu={handleNodeContextMenu}
                  onPaneContextMenu={handlePaneContextMenu}
                  onAutoLayout={() => void autoLayout()}
                  isLayouting={isLayouting}
                  onToggleLayoutMode={() =>
                    setLayoutMode((current) => (current === 'manual' ? 'auto' : 'manual'))
                  }
                />
              </ReactFlowProvider>
            ) : (
              <div className="spec-view">
                <div className="spec-bar">
                  <span>
                    {document.document?.name || 'workflow'}.{specFormat === 'json' ? 'json' : 'yaml'}
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
                  <button
                    type="button"
                    className="spec-bar-action"
                    onClick={() => fileInput.current?.click()}
                    title="Import a workflow file (YAML / JSON)"
                  >
                    Import file
                  </button>
                  <button
                    type="button"
                    className="spec-bar-action"
                    onClick={formatSpec}
                    title="Format specification"
                  >
                    Format
                  </button>
                  <button
                    type="button"
                    className="spec-bar-action"
                    onClick={copySpec}
                    title="Copy specification"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="spec-bar-action"
                    onClick={exportSpec}
                    title="Export specification"
                  >
                    Export
                  </button>
                </div>
                <SpecEditor
                  value={specText}
                  format={specFormat}
                  theme={theme}
                  diagnostics={specDiagnostics}
                  onChange={handleSpecificationChange}
                  onCursorChange={(line, column) => setSpecCursor({ line, column })}
                  jump={specJump}
                />
              </div>
            )}
          </div>
          <ProblemsPanel
            open={problemsOpen}
            onToggle={() => setProblemsOpen((current) => !current)}
            items={problemItems}
          />
        </section>
        <ResizeHandle side="right" onResize={(width) => updatePanelWidth('right', width)} />
        <aside className="right-rail" aria-label="Workflow operations">
          <Inspector
            selected={selected as never}
            document={document}
            onDocumentChange={syncDocument}
            onRequestDelete={requestTaskDelete}
            collapsed={inspectorCollapsed}
            onToggle={() => setInspectorCollapsed((current) => !current)}
            onOpenSubflow={handleOpenSubflow}
            existingWorkflowNames={workflowRecords.map((r) => r.name)}
          />
          <RuntimePanel
            document={document}
            side
            open={runtimeOpen}
            onOpenChange={setRuntimeOpen}
            onRunStatusChange={handleRunStatusChange}
            onHealthChange={(healthy) => setRuntimeHealthy(healthy)}
            subflowDocuments={workspaceDocuments}
          />
        </aside>
      </div>
      <ConfirmDialog
        task={taskDeleteRequest}
        onCancel={() => setTaskDeleteRequest(null)}
        onConfirm={confirmTaskDelete}
      />
      <ShortcutsDialog isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <TemplateLibraryDialog
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={handleSelectTemplate}
      />
      <RevisionHistoryDialog
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        currentSpecification={specText}
        revisions={
          workflowRecords.find((r) => r.id === workflowId)?.revisions || [
            {
              id: 'current',
              timestamp: Date.now(),
              specification: specText,
              format: specFormat,
              summary: 'Current draft',
            },
          ]
        }
        onRestoreRevision={handleRestoreRevision}
      />
      <DeploymentBundleDialog
        open={showDeploymentBundle}
        onClose={() => setShowDeploymentBundle(false)}
        specYaml={specFormat === 'yaml' ? specText : serializeWorkflow(document, 'yaml')}
        workflowName={workflowName}
        availableDocuments={workspaceDocuments}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={paletteCommands}
      />
      <QuickOpenDialog
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        items={quickOpenItems}
        mode={quickOpenMode}
        searchResults={workspaceSearchIndex}
        searchQuery={quickOpenSearchQuery}
        onSearchQueryChange={setQuickOpenSearchQuery}
      />
      <ContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={globalTheme}
        onThemeChange={setGlobalTheme}
        workflowTheme={workflowThemes[workflowId] ?? null}
        onWorkflowThemeChange={setWorkflowThemeOverride}
        leftRailOpen={!leftRailMinimized}
        inspectorOpen={!inspectorCollapsed}
        runtimeOpen={runtimeOpen}
        onToggleRail={toggleLeftRail}
        onToggleInspector={() => setInspectorCollapsed((current) => !current)}
        onToggleRuntime={() => setRuntimeOpen((current) => !current)}
        onResetPanelWidths={resetPanelWidths}
        showMiniMap={canvasPrefs.showMiniMap}
        onToggleMiniMap={toggleMiniMap}
        initialGatewayUrl={window.localStorage.getItem('open-workflow-gateway-url') || ''}
        initialAuthToken={window.localStorage.getItem('open-workflow-gateway-token') || ''}
        onGatewayConfigApply={applyGatewayConfig}
        onExportProfile={exportSettingsProfile}
        onImportProfile={importSettingsProfile}
      />
      <StatusBar
        selectedTaskName={selectedTaskName}
        problemCount={problemItems.filter((item) => item.severity === 'error').length}
        warningCount={problemItems.filter((item) => item.severity === 'warning').length}
        cursor={view === 'spec' ? specCursor : null}
        format={specFormat}
        workflowName={workflowName}
        saveState={saveState}
        dirty={dirty}
        runtimeHealthy={runtimeHealthy}
        notice={notice}
        view={view}
        onOpenProblems={() => setProblemsOpen((current) => !current)}
        onOpenPalette={() => setCommandPaletteOpen(true)}
      />
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
