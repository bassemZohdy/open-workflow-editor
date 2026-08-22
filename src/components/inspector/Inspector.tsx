import { useState, useEffect, useMemo, type DragEvent } from 'react';
import {
  AI_TASK_SPECS,
  updateTopLevelTaskConfig,
  updateTopLevelTaskField,
  updateTopLevelTaskName,
} from '../../workflowModel';
import { AiTaskCard } from './AiTaskCard';
import { formatError, formatJsonInput, objectToPairs, objectToCatalogEntries } from '../../formatters';
import { taskColors } from '../../taskMeta';
import { validateJavaScriptFunction } from '../../scriptContract';
import {
  JsonObjectBuilder,
  objectToJsonBuilderEntries,
  jsonBuilderEntriesToObject,
  type JsonBuilderEntry,
} from '../common/JsonObjectBuilder';
import { DurationField } from '../common/DurationField';
import { ExpressionInput } from '../common/ExpressionInput';
import { pairsToObject, type KeyValuePair } from '../common/KeyValuePairs';
import { SwitchCaseEditor, type SwitchCaseItem } from './SwitchCaseEditor';
import { HttpCallEditor } from './HttpCallEditor';
import { ScriptTaskEditor, type CatalogEntry } from './ScriptTaskEditor';
import { SubflowEditor } from './SubflowEditor';
import { ForTaskEditor } from './ForTaskEditor';
import { ForkTaskEditor, type ForkBranchItem } from './ForkTaskEditor';
import { ListenTaskEditor, type ListenConfigOptions } from './ListenTaskEditor';
import { TryTaskEditor, type CatchConfigOptions } from './TryTaskEditor';
import type { TaskDefinition, TaskType, WorkflowDocument } from '../../types';

export interface SelectedTaskInfo {
  id: string;
  name: string;
  task: TaskDefinition;
  type: TaskType;
}

export interface InspectorProps {
  selected: SelectedTaskInfo | null;
  document: WorkflowDocument;
  onDocumentChange: (nextDocument: WorkflowDocument) => void;
  onRequestDelete: (taskId: string) => void;
  collapsed?: boolean;
  onToggle: () => void;
  onOpenSubflow?: (name: string, namespace?: string, version?: string) => void;
  existingWorkflowNames?: string[];
}

function readSwitchCases(task?: TaskDefinition): SwitchCaseItem[] {
  return (Array.isArray(task?.switch) ? task.switch : []).flatMap((entry) => {
    const [name, definition] = Object.entries(entry || {})[0] || [];
    return name ? [{ name, definition: { ...(definition || {}) } }] : [];
  });
}

function normalizeSwitchCases(cases: SwitchCaseItem[]): SwitchCaseItem[] {
  const usedNames = new Set<string>();
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

function readForkBranches(task?: TaskDefinition): ForkBranchItem[] {
  const branches = Array.isArray(task?.fork?.branches) ? task.fork.branches : [];
  return branches.flatMap((entry, index) => {
    const [name, definition] = Object.entries(entry || {})[0] || [];
    return name
      ? [{ name, taskJson: JSON.stringify(definition || { set: { value: '' } }, null, 2) }]
      : [{ name: `branch${index + 1}`, taskJson: JSON.stringify({ set: { value: '' } }, null, 2) }];
  });
}

export function Inspector({
  selected,
  document,
  onDocumentChange,
  onRequestDelete,
  collapsed = false,
  onToggle,
  onOpenSubflow,
  existingWorkflowNames,
}: InspectorProps) {
  const [name, setName] = useState(selected?.name || '');
  const [config, setConfig] = useState(selected ? JSON.stringify(selected.task, null, 2) : '');
  const [setValue, setSetValue] = useState('');
  const [setEntries, setSetEntries] = useState<JsonBuilderEntry[]>([]);
  const [callMode, setCallMode] = useState<'http' | 'function'>('http');
  const [method, setMethod] = useState('get');
  const [endpoint, setEndpoint] = useState('');
  const [callHeaders, setCallHeaders] = useState<KeyValuePair[]>([]);
  const [callQuery, setCallQuery] = useState<KeyValuePair[]>([]);
  const [callBodyEntries, setCallBodyEntries] = useState<JsonBuilderEntry[]>([]);
  const [callOutput, setCallOutput] = useState('content');
  const [callRedirect, setCallRedirect] = useState(false);
  const [functionName, setFunctionName] = useState('');
  const [functionArgEntries, setFunctionArgEntries] = useState<JsonBuilderEntry[]>([]);
  const [functionEntries, setFunctionEntries] = useState<Array<{ name: string; taskJson: string }>>([]);
  const [switchCases, setSwitchCases] = useState<SwitchCaseItem[]>([]);
  const [duration, setDuration] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDataEntries, setEventDataEntries] = useState<JsonBuilderEntry[]>([]);
  const [scriptCode, setScriptCode] = useState('');
  const [runMode, setRunMode] = useState<'javascript' | 'subflow'>('javascript');
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [subflowNamespace, setSubflowNamespace] = useState('dubai-government');
  const [subflowName, setSubflowName] = useState('shared-renewal-notification');
  const [subflowVersion, setSubflowVersion] = useState('1.0.0');
  const [subflowInputEntries, setSubflowInputEntries] = useState<JsonBuilderEntry[]>([]);
  const [errorType, setErrorType] = useState('');
  const [errorStatus, setErrorStatus] = useState('');
  const [errorData, setErrorData] = useState('');

  // for task state
  const [forEach, setForEach] = useState('item');
  const [forIn, setForIn] = useState('${ $context.items }');
  const [forAt, setForAt] = useState('');
  const [forTasks, setForTasks] = useState('[]');

  // fork task state
  const [forkBranches, setForkBranches] = useState<ForkBranchItem[]>([]);
  const [forkCompete, setForkCompete] = useState(false);

  // listen task state
  const [listenMode, setListenMode] = useState('one');
  const [listenType, setListenType] = useState('');
  const [listenSource, setListenSource] = useState('');
  const [listenRead, setListenRead] = useState('data');

  // try task state
  const [tryTasks, setTryTasks] = useState('[]');
  const [catchErrorType, setCatchErrorType] = useState('');
  const [retryDelay, setRetryDelay] = useState('');
  const [retryCount, setRetryCount] = useState('');
  const [catchTasks, setCatchTasks] = useState('[]');

  // shared task state
  const [condition, setCondition] = useState('');
  const [inputEntries, setInputEntries] = useState<JsonBuilderEntry[]>([]);
  const [outputEntries, setOutputEntries] = useState<JsonBuilderEntry[]>([]);
  const [exportEntries, setExportEntries] = useState<JsonBuilderEntry[]>([]);
  const [timeout, setTimeoutValue] = useState('');
  const [metadataEntries, setMetadataEntries] = useState<JsonBuilderEntry[]>([]);
  const [fieldError, setFieldError] = useState('');
  const selectedSignature = selected
    ? JSON.stringify({ name: selected.name, type: selected.type, task: selected.task })
    : '';

  // AI delegation card: shown when a `run` task targets the `ai` namespace.
  const aiSubflowSpec = useMemo(() => {
    if (runMode !== 'subflow') return undefined;
    return AI_TASK_SPECS.find(
      (spec) => spec.subflowNamespace === subflowNamespace && spec.subflowName === subflowName,
    );
  }, [runMode, subflowName, subflowNamespace]);

  useEffect(() => {
    setName(selected?.name || '');
    setConfig(selected ? JSON.stringify(selected.task, null, 2) : '');
    setFieldError('');

    const firstSetValue = Object.values(selected?.task.set || {})[0];
    setSetValue(
      firstSetValue !== undefined
        ? typeof firstSetValue === 'object'
          ? JSON.stringify(firstSetValue, null, 2)
          : String(firstSetValue)
        : '',
    );
    const setObj = selected?.task.set;
    setSetEntries(
      setObj && typeof setObj === 'object' && !Array.isArray(setObj)
        ? objectToJsonBuilderEntries(setObj)
        : [],
    );
    const isCallFunction =
      selected?.type === 'call' &&
      Boolean(
        (!selected.task.with?.endpoint && !selected.task.with?.method && selected.task.call) ||
        (document.use?.functions &&
          typeof selected.task.call === 'string' &&
          selected.task.call in document.use.functions),
      );
    setCallMode(isCallFunction ? 'function' : 'http');
    setFunctionName(isCallFunction && typeof selected?.task.call === 'string' ? selected.task.call : '');
    setFunctionArgEntries(
      isCallFunction && selected?.task.with && typeof selected.task.with === 'object'
        ? objectToJsonBuilderEntries(selected.task.with)
        : [],
    );
    setMethod(String(selected?.task.with?.method || 'get').toLowerCase());
    setEndpoint(String(selected?.task.with?.endpoint || ''));
    setCallHeaders(objectToPairs(selected?.task.with?.headers as Record<string, unknown>));
    setCallQuery(objectToPairs(selected?.task.with?.query as Record<string, unknown>));
    setCallBodyEntries(objectToJsonBuilderEntries(selected?.task.with?.body));
    setCallOutput(String(selected?.task.with?.output || 'content'));
    setCallRedirect(Boolean(selected?.task.with?.redirect));
    setSwitchCases(readSwitchCases(selected?.task));
    setDuration(selected?.task.wait || '');
    setEventType(String((selected?.task.emit?.event as { with?: { type?: string } })?.with?.type || ''));
    setEventDataEntries(
      objectToJsonBuilderEntries((selected?.task.emit?.event as { with?: { data?: unknown } })?.with?.data),
    );
    setScriptCode(selected?.task.run?.script?.code || '');
    setRunMode(selected?.task.run?.workflow ? 'subflow' : 'javascript');
    setCatalogEntries(objectToCatalogEntries(document.use?.catalogs as Record<string, unknown>));
    const fns = (document.use?.functions as Record<string, TaskDefinition>) || {};
    setFunctionEntries(
      Object.entries(fns).map(([fnKey, def]) => ({
        name: fnKey,
        taskJson: JSON.stringify(def || { set: {} }, null, 2),
      })),
    );
    setSubflowNamespace(selected?.task.run?.workflow?.namespace || 'dubai-government');
    setSubflowName(selected?.task.run?.workflow?.name || 'shared-renewal-notification');
    setSubflowVersion(selected?.task.run?.workflow?.version || '1.0.0');
    setSubflowInputEntries(objectToJsonBuilderEntries(selected?.task.input));
    setErrorType(selected?.task.raise?.error?.type || '');
    setErrorStatus(
      selected?.task.raise?.error?.status !== undefined ? String(selected.task.raise.error.status) : '',
    );
    setErrorData(
      selected?.task.raise?.error?.data ? JSON.stringify(selected.task.raise.error.data, null, 2) : '',
    );

    // for task
    setForEach(selected?.type === 'for' ? selected.task.for?.each || 'item' : 'item');
    setForIn(
      selected?.type === 'for'
        ? String(selected.task.for?.in || '${ $context.items }')
        : '${ $context.items }',
    );
    setForAt(selected?.type === 'for' ? selected.task.for?.at || '' : '');
    setForTasks(selected?.type === 'for' ? JSON.stringify(selected.task.do || [], null, 2) : '[]');

    // fork task
    setForkBranches(selected?.type === 'fork' ? readForkBranches(selected.task) : []);
    setForkCompete(selected?.type === 'fork' ? Boolean(selected.task.fork?.compete) : false);

    // listen task
    const listenObj = selected?.task.listen;
    const isAny = Array.isArray(listenObj?.to?.any);
    setListenMode(isAny ? 'any' : 'one');
    const filterObj = isAny ? listenObj?.to?.any?.[0]?.with : listenObj?.to?.one?.with;
    setListenType(filterObj?.type || '');
    setListenSource(filterObj?.source || '');
    setListenRead(listenObj?.read || 'data');

    // try task
    setTryTasks(selected?.type === 'try' ? JSON.stringify(selected.task.try || [], null, 2) : '[]');
    setCatchErrorType(
      selected?.type === 'try'
        ? (selected.task.catch?.errors as { with?: { type?: string } })?.with?.type || ''
        : '',
    );
    setRetryDelay(
      selected?.type === 'try' && typeof selected.task.catch?.retry?.delay === 'string'
        ? selected.task.catch.retry.delay
        : '',
    );
    setRetryCount(
      selected?.type === 'try' && selected.task.catch?.retry?.limit?.attempt?.count !== undefined
        ? String(selected.task.catch.retry.limit.attempt.count)
        : '',
    );
    setCatchTasks(selected?.type === 'try' ? JSON.stringify(selected.task.catch?.do || [], null, 2) : '[]');

    // shared fields
    setCondition(selected?.task.if || '');
    setInputEntries(objectToJsonBuilderEntries(selected?.task.input));
    setOutputEntries(objectToJsonBuilderEntries(selected?.task.output));
    setExportEntries(objectToJsonBuilderEntries(selected?.task.export));
    setTimeoutValue(selected?.task.timeout || '');
    setMetadataEntries(objectToJsonBuilderEntries(selected?.task.metadata));
  }, [document.use?.catalogs, selectedSignature]);

  const updateDocumentMetadata = (field: 'name' | 'namespace' | 'version', val: string) => {
    const nextDocument: WorkflowDocument = {
      ...document,
      document: {
        ...(document.document || {}),
        [field]: val.trim() || undefined,
      },
    };
    onDocumentChange(nextDocument);
  };

  const applyFunctionEntries = (entries: Array<{ name: string; taskJson: string }>) => {
    try {
      const fns: Record<string, TaskDefinition> = {};
      const seenNames = new Set<string>();
      let duplicateName = '';

      entries.forEach((entry) => {
        const trimmed = entry.name.trim();
        if (!trimmed) return;
        if (seenNames.has(trimmed)) {
          duplicateName = trimmed;
        }
        seenNames.add(trimmed);
        try {
          fns[trimmed] = JSON.parse(entry.taskJson);
        } catch {
          fns[trimmed] = { set: { raw: entry.taskJson } };
        }
      });

      if (duplicateName) {
        setFieldError(`Function name "${duplicateName}" is duplicated in use.functions.`);
        return;
      }

      const nextDocument: WorkflowDocument = {
        ...document,
        use: {
          ...(document.use || {}),
          functions: Object.keys(fns).length ? fns : undefined,
        },
      };
      if (!Object.keys(fns).length && nextDocument.use && !Object.keys(nextDocument.use).length) {
        delete nextDocument.use;
      }
      onDocumentChange(nextDocument);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyCatalogEntries = (entries: CatalogEntry[]) => {
    try {
      const catalogs = Object.fromEntries(
        entries
          .map((entry) => [entry.name.trim(), { endpoint: entry.endpoint.trim() }])
          .filter(([name]) => name),
      );
      const nextDocument: WorkflowDocument = {
        ...document,
        use: {
          ...(document.use || {}),
          catalogs: Object.keys(catalogs).length ? catalogs : undefined,
        },
      };
      if (!Object.keys(catalogs).length && nextDocument.use && !Object.keys(nextDocument.use).length) {
        delete nextDocument.use;
      }
      onDocumentChange(nextDocument);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  if (!selected) {
    return (
      <aside
        className={`inspector ${collapsed ? 'inspector-collapsed' : ''}`}
        aria-label="Document inspector"
      >
        <div className="inspector-head">
          <div
            className="inspector-head-title"
            title={collapsed ? 'Expand Inspector' : 'Collapse Inspector'}
            onClick={onToggle}
          >
            <span className="panel-chevron" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
            <span>
              <span className="section-kicker">Document</span>
              <h2>Workflow Settings</h2>
            </span>
          </div>
          <button
            type="button"
            className="rail-collapse-button"
            onClick={onToggle}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
            title={`${collapsed ? 'Expand' : 'Collapse'} Inspector`}
          >
            {collapsed ? '‹' : '›'}
          </button>
        </div>
        {!collapsed && (
          <div className="inspector-body">
            <div className="doc-settings-summary-card">
              <span className="summary-pill">{document.do?.length || 0} tasks defined</span>
              <span className="summary-pill">
                {Object.keys(document.use?.functions || {}).length} reusable functions
              </span>
            </div>

            <label className="field">
              <span>Workflow Name</span>
              <input
                aria-label="Workflow doc name"
                value={document.document?.name || ''}
                placeholder="workflow-name"
                onChange={(event) => updateDocumentMetadata('name', event.target.value)}
              />
            </label>

            <div className="grid-two-col">
              <label className="field">
                <span>Namespace</span>
                <input
                  aria-label="Workflow doc namespace"
                  value={document.document?.namespace || ''}
                  placeholder="namespace"
                  onChange={(event) => updateDocumentMetadata('namespace', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Version</span>
                <input
                  aria-label="Workflow doc version"
                  value={document.document?.version || ''}
                  placeholder="1.0.0"
                  onChange={(event) => updateDocumentMetadata('version', event.target.value)}
                />
              </label>
            </div>

            <details className="inspector-parameter-section" open aria-label="Document Reusable Functions">
              <summary>
                <span>Reusable functions</span>
                <small>use.functions ({functionEntries.length})</small>
              </summary>
              <div className="parameter-section-body">
                {functionEntries.map((entry, index) => (
                  <div className="function-entry-card" key={`doc-fn-${index}`}>
                    <div className="function-entry-header">
                      <input
                        aria-label={`Function ${index + 1} name`}
                        placeholder="Function name"
                        value={entry.name}
                        onChange={(event) => {
                          const next = functionEntries.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, name: event.target.value } : item,
                          );
                          setFunctionEntries(next);
                        }}
                        onBlur={() => applyFunctionEntries(functionEntries)}
                      />
                      <button
                        type="button"
                        className="pair-remove"
                        aria-label={`Remove function ${index + 1}`}
                        onClick={() => {
                          const next = functionEntries.filter((_, itemIndex) => itemIndex !== index);
                          setFunctionEntries(next);
                          applyFunctionEntries(next);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      className="resize-none code-field"
                      aria-label={`Function ${index + 1} task JSON`}
                      rows={3}
                      value={entry.taskJson}
                      onChange={(event) => {
                        const next = functionEntries.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, taskJson: event.target.value } : item,
                        );
                        setFunctionEntries(next);
                      }}
                      onBlur={() => applyFunctionEntries(functionEntries)}
                      spellCheck="false"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="pair-add"
                  onClick={() => {
                    const next = [
                      ...functionEntries,
                      {
                        name: `fn${functionEntries.length + 1}`,
                        taskJson: JSON.stringify({ set: { status: 'completed' } }, null, 2),
                      },
                    ];
                    setFunctionEntries(next);
                    applyFunctionEntries(next);
                  }}
                >
                  ＋ Add reusable function
                </button>
              </div>
            </details>

            <details className="inspector-parameter-section" aria-label="Document Resource Catalogs">
              <summary>
                <span>Resource catalogs</span>
                <small>use.catalogs ({catalogEntries.length})</small>
              </summary>
              <div className="parameter-section-body">
                {catalogEntries.map((entry, index) => (
                  <div className="resource-catalog-row" key={`doc-cat-${index}`}>
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
            </details>

            {fieldError && (
              <div className="field-error" role="alert">
                {fieldError}
              </div>
            )}

            <div className="field-hint">
              <span>💡</span>
              <p>
                Click any task node on the canvas or palette to inspect and configure its task-specific
                properties.
              </p>
            </div>
          </div>
        )}
      </aside>
    );
  }

  const applyConfig = () => {
    try {
      const parsed = JSON.parse(config);
      const next = updateTopLevelTaskConfig(document, selected.id, parsed);
      onDocumentChange(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyField = (path: string[], value: unknown) => {
    try {
      const next = updateTopLevelTaskField(document, selected.id, path, value);
      onDocumentChange(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyPairsField = (path: string[], pairs: KeyValuePair[]) => {
    const objectValue = pairsToObject(pairs);
    applyField(path, Object.keys(objectValue).length ? objectValue : undefined);
  };

  const applyJsonObjectField = (path: string[], entries: JsonBuilderEntry[]) => {
    try {
      const objectValue = jsonBuilderEntriesToObject(entries);
      applyField(path, Object.keys(objectValue).length ? objectValue : undefined);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyJsonField = (path: string[], jsonText: string, expectedType: 'object' | 'array' = 'object') => {
    try {
      const parsed = formatJsonInput(jsonText, expectedType);
      applyField(path, parsed);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applyNameChange = () => {
    if (!name.trim() || name === selected.name) return;
    try {
      const next = updateTopLevelTaskName(document, selected.id, name.trim());
      onDocumentChange(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applySetValue = () => {
    try {
      const existingKey = Object.keys(selected.task.set || {})[0] || 'value';
      let parsedValue: unknown = setValue;
      try {
        parsedValue = JSON.parse(setValue);
      } catch {
        parsedValue = setValue;
      }
      applyField(['set'], { [existingKey]: parsedValue });
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applySwitchCases = (nextCases: SwitchCaseItem[]) => {
    const normalized = normalizeSwitchCases(nextCases);
    setSwitchCases(normalized);
    applyField(
      ['switch'],
      normalized.map((item) => ({ [item.name]: item.definition })),
    );
  };

  const updateSwitchCase = (index: number, field: 'when' | 'then', value: string, commit = false) => {
    const nextCases = switchCases.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextDefinition = { ...item.definition, [field]: value };
      if (!value) delete nextDefinition[field];
      return { ...item, definition: nextDefinition };
    });
    setSwitchCases(nextCases);
    if (commit) applySwitchCases(nextCases);
  };

  const addSwitchCase = () => {
    const nextCases = [
      ...switchCases,
      { name: `case${switchCases.length + 1}`, definition: { when: '${ true }' } },
    ];
    applySwitchCases(nextCases);
  };

  const removeSwitchCase = (index: number) => {
    const nextCases = switchCases.filter((_, itemIndex) => itemIndex !== index);
    applySwitchCases(nextCases);
  };

  const handleSwitchCaseDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.getData('application/open-workflow-switch-case') === 'new-case') {
      addSwitchCase();
    }
  };

  const applyScriptCode = (code = scriptCode) => {
    try {
      const validation = validateJavaScriptFunction(code);
      if (!validation.valid) {
        setFieldError(validation.message || 'Invalid JavaScript function');
        return;
      }
      applyField(['run', 'script'], { language: 'javascript', code });
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const onApplyFunctionCall = (fnName: string, args: JsonBuilderEntry[]) => {
    try {
      const argsObj = jsonBuilderEntriesToObject(args);
      const nextTask: TaskDefinition = {
        ...(selected?.task || {}),
        call: fnName.trim() || undefined,
        with: Object.keys(argsObj).length ? argsObj : undefined,
      };
      if (!fnName.trim()) delete nextTask.call;
      if (!Object.keys(argsObj).length) delete nextTask.with;
      const next = updateTopLevelTaskConfig(document, selected.id, nextTask);
      onDocumentChange(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const applySubflow = (
    nextInputEntries = subflowInputEntries,
    overrides?: { namespace?: string; name?: string; version?: string },
  ) => {
    try {
      const inputs = jsonBuilderEntriesToObject(nextInputEntries);
      const ns = overrides?.namespace !== undefined ? overrides.namespace : subflowNamespace;
      const nm = overrides?.name !== undefined ? overrides.name : subflowName;
      const ver = overrides?.version !== undefined ? overrides.version : subflowVersion;
      const taskObj: TaskDefinition = {
        run: {
          workflow: {
            namespace: ns.trim() || 'dubai-government',
            name: nm.trim() || 'shared-renewal-notification',
            version: ver.trim() || '1.0.0',
          },
        },
      };
      if (Object.keys(inputs).length) taskObj.input = inputs;
      const next = updateTopLevelTaskConfig(document, selected.id, taskObj);
      onDocumentChange(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const changeRunMode = (mode: string) => {
    setRunMode(mode as 'javascript' | 'subflow');
    if (mode === 'subflow') {
      applySubflow();
    } else {
      applyField(['run'], {
        script: {
          language: 'javascript',
          code:
            scriptCode ||
            '({ input, context, catalogs }) => ({\n  approved: true,\n  processedAt: new Date().toISOString(),\n})',
        },
      });
    }
  };

  const applyErrorConfig = () => {
    try {
      const errorObj: { type?: string; status?: number; data?: unknown } = {};
      if (errorType.trim()) errorObj.type = errorType.trim();
      if (errorStatus.trim()) errorObj.status = Number(errorStatus.trim());
      if (errorData.trim()) errorObj.data = JSON.parse(errorData.trim());
      applyField(['raise', 'error'], Object.keys(errorObj).length ? errorObj : undefined);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  // Fork operations
  const applyForkBranches = (branches: ForkBranchItem[]) => {
    try {
      const branchItems = branches.map((b) => {
        let def: unknown = { set: { value: '' } };
        try {
          def = JSON.parse(b.taskJson);
        } catch {
          // fallback
        }
        return { [b.name]: def };
      });
      applyField(['fork', 'branches'], branchItems);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const addForkBranch = () => {
    const next: ForkBranchItem[] = [
      ...forkBranches,
      { name: `branch${forkBranches.length + 1}`, taskJson: JSON.stringify({ set: { value: '' } }, null, 2) },
    ];
    setForkBranches(next);
    applyForkBranches(next);
  };

  const removeForkBranch = (index: number) => {
    const next = forkBranches.filter((_, idx) => idx !== index);
    setForkBranches(next);
    applyForkBranches(next);
  };

  const updateForkBranchName = (index: number, branchName: string) => {
    const next = forkBranches.map((b, idx) => (idx === index ? { ...b, name: branchName } : b));
    setForkBranches(next);
    applyForkBranches(next);
  };

  const updateForkBranchTask = (index: number, taskJson: string) => {
    try {
      JSON.parse(taskJson);
      const next = forkBranches.map((b, idx) => (idx === index ? { ...b, taskJson } : b));
      setForkBranches(next);
      applyForkBranches(next);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  // Listen operations
  const applyListenConfig = ({
    mode = listenMode,
    type = listenType,
    source = listenSource,
    read = listenRead,
  }: ListenConfigOptions) => {
    try {
      const filter: { type?: string; source?: string } = {};
      if (type.trim()) filter.type = type.trim();
      if (source.trim()) filter.source = source.trim();
      const listenObj: {
        to?: { one?: { with?: typeof filter }; any?: Array<{ with?: typeof filter }> };
        read?: string;
      } = {};
      if (mode === 'any') {
        listenObj.to = { any: [{ with: filter }] };
      } else {
        listenObj.to = { one: { with: filter } };
      }
      if (read) listenObj.read = read;
      applyField(['listen'], listenObj);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  // Try / Catch operations
  const applyCatchConfig = ({
    errorType: errType = catchErrorType,
    retryDelay: rd = retryDelay,
    retryCount: rc = retryCount,
  }: CatchConfigOptions) => {
    try {
      const existingCatch = (selected?.task.catch || {}) as Record<string, unknown>;
      const catchObj: Record<string, unknown> = { ...existingCatch };
      if (errType.trim()) {
        catchObj.errors = { with: { type: errType.trim() } };
      } else {
        delete catchObj.errors;
      }

      const retryObj: { delay?: string; limit?: { attempt?: { count?: number } } } = {};
      if (rd) retryObj.delay = rd;
      if (rc !== '' && !Number.isNaN(Number(rc))) {
        retryObj.limit = { attempt: { count: Number(rc) } };
      }

      if (Object.keys(retryObj).length) catchObj.retry = retryObj;
      else delete catchObj.retry;

      if (!catchObj.do) catchObj.do = [{ fallback: { set: { value: '' } } }];
      applyField(['catch'], catchObj);
      setFieldError('');
    } catch (error) {
      setFieldError(formatError(error));
    }
  };

  const availableNextTasks = (document.do || [])
    .flatMap((item) => Object.keys(item || {}))
    .filter((taskName) => taskName !== selected.name);
  const selectedNextTask = selected.task.then || '';

  return (
    <aside className={`inspector ${collapsed ? 'inspector-collapsed' : ''}`}>
      <div className="inspector-head">
        <div
          className="inspector-head-title"
          title={collapsed ? 'Expand Inspector' : 'Collapse Inspector'}
          onClick={onToggle}
        >
          <span className="panel-chevron" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span>
            <span className="section-kicker">Inspector</span>
            <h2>{selected.type} task</h2>
          </span>
        </div>
        <div className="inspector-head-actions">
          <span className={`task-badge ${taskColors[selected.type]}`}>{selected.type}</span>
          <button
            type="button"
            className="button secondary inspector-delete-button"
            onClick={() => onRequestDelete(selected.id)}
            aria-label="Delete task"
            title="Delete task from workflow"
          >
            Delete
          </button>
          <button
            type="button"
            className="rail-collapse-button"
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
            aria-label="Task name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={applyNameChange}
          />
        </label>
        {selected.type === 'set' && (
          <div className="field">
            <span>
              Variables <small>set · Key, value, type</small>
            </span>
            <JsonObjectBuilder
              label="Set task variables"
              entries={setEntries}
              onChange={setSetEntries}
              onCommit={(entries) => {
                const nextObj = jsonBuilderEntriesToObject(entries);
                applyField(['set'], nextObj);
              }}
            />
          </div>
        )}
        {selected.type === 'call' && (
          <HttpCallEditor
            callMode={callMode}
            setCallMode={setCallMode}
            method={method}
            setMethod={setMethod}
            endpoint={endpoint}
            setEndpoint={setEndpoint}
            callHeaders={callHeaders}
            setCallHeaders={setCallHeaders}
            callQuery={callQuery}
            setCallQuery={setCallQuery}
            callBodyEntries={callBodyEntries}
            setCallBodyEntries={setCallBodyEntries}
            callOutput={callOutput}
            setCallOutput={setCallOutput}
            callRedirect={callRedirect}
            setCallRedirect={setCallRedirect}
            functionName={functionName}
            setFunctionName={setFunctionName}
            availableFunctions={Object.keys(document.use?.functions || {})}
            functionArgEntries={functionArgEntries}
            setFunctionArgEntries={setFunctionArgEntries}
            applyField={applyField}
            applyPairsField={applyPairsField}
            applyJsonObjectField={applyJsonObjectField}
            onApplyFunctionCall={onApplyFunctionCall}
          />
        )}
        {selected.type === 'switch' && (
          <SwitchCaseEditor
            switchCases={switchCases}
            setSwitchCases={setSwitchCases}
            applySwitchCases={applySwitchCases}
            updateSwitchCase={updateSwitchCase}
            addSwitchCase={addSwitchCase}
            removeSwitchCase={removeSwitchCase}
            handleSwitchCaseDrop={handleSwitchCaseDrop}
          />
        )}
        {selected.type === 'for' && (
          <ForTaskEditor
            forEach={forEach}
            setForEach={setForEach}
            forIn={forIn}
            setForIn={setForIn}
            forAt={forAt}
            setForAt={setForAt}
            forTasks={forTasks}
            setForTasks={setForTasks}
            applyField={applyField}
            applyJsonField={applyJsonField}
          />
        )}
        {selected.type === 'fork' && (
          <ForkTaskEditor
            forkBranches={forkBranches}
            setForkBranches={setForkBranches}
            applyForkBranches={applyForkBranches}
            addForkBranch={addForkBranch}
            removeForkBranch={removeForkBranch}
            updateForkBranchName={updateForkBranchName}
            updateForkBranchTask={updateForkBranchTask}
            forkCompete={forkCompete}
            setForkCompete={setForkCompete}
            applyField={applyField}
          />
        )}
        {selected.type === 'listen' && (
          <ListenTaskEditor
            listenMode={listenMode}
            setListenMode={setListenMode}
            listenType={listenType}
            setListenType={setListenType}
            listenSource={listenSource}
            setListenSource={setListenSource}
            listenRead={listenRead}
            setListenRead={setListenRead}
            applyListenConfig={applyListenConfig}
          />
        )}
        {selected.type === 'try' && (
          <TryTaskEditor
            tryTasks={tryTasks}
            setTryTasks={setTryTasks}
            catchErrorType={catchErrorType}
            setCatchErrorType={setCatchErrorType}
            retryDelay={retryDelay}
            setRetryDelay={setRetryDelay}
            retryCount={retryCount}
            setRetryCount={setRetryCount}
            catchTasks={catchTasks}
            setCatchTasks={setCatchTasks}
            applyJsonField={applyJsonField}
            applyCatchConfig={applyCatchConfig}
          />
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
                placeholder="https://example.com/errors/invalid-account"
                onChange={(event) => setErrorType(event.target.value)}
                onBlur={applyErrorConfig}
              />
            </label>
            <label className="field">
              <span>Error status code</span>
              <input
                type="number"
                value={errorStatus}
                placeholder="400"
                onChange={(event) => setErrorStatus(event.target.value)}
                onBlur={applyErrorConfig}
              />
            </label>
            <label className="field">
              <span>
                Error data <small>JSON</small>
              </span>
              <textarea
                className="resize-none"
                value={errorData}
                placeholder="{}"
                onChange={(event) => setErrorData(event.target.value)}
                onBlur={applyErrorConfig}
                spellCheck="false"
              />
            </label>
          </>
        )}
        {selected.type === 'do' && (
          <label className="field">
            <span>
              Nested task list <small>do · JSON</small>
            </span>
            <textarea
              className="resize-none"
              value={setValue}
              onChange={(event) => setSetValue(event.target.value)}
              onBlur={() => applyJsonField(['do'], setValue, 'array')}
              spellCheck="false"
            />
          </label>
        )}
        {selected.type === 'run' && (
          <>
            {runMode === 'subflow' && aiSubflowSpec && onOpenSubflow && (
              <AiTaskCard
                spec={aiSubflowSpec}
                onOpenSubflow={() => onOpenSubflow(subflowName, subflowNamespace, subflowVersion)}
              />
            )}
            <label className="field">
              <span>
                Run mode <small>run</small>
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
              <ScriptTaskEditor
                scriptCode={scriptCode}
                setScriptCode={setScriptCode}
                applyScriptCode={applyScriptCode}
                catalogEntries={catalogEntries}
                setCatalogEntries={setCatalogEntries}
                applyCatalogEntries={applyCatalogEntries}
              />
            ) : (
              <SubflowEditor
                subflowNamespace={subflowNamespace}
                setSubflowNamespace={setSubflowNamespace}
                subflowName={subflowName}
                setSubflowName={setSubflowName}
                subflowVersion={subflowVersion}
                setSubflowVersion={setSubflowVersion}
                subflowInputEntries={subflowInputEntries}
                setSubflowInputEntries={setSubflowInputEntries}
                applySubflow={applySubflow}
                onOpenSubflow={onOpenSubflow}
                existingWorkflows={existingWorkflowNames}
              />
            )}
          </>
        )}
        <div className="inspector-section-heading shared-options-heading">
          <span>Shared task options</span>
          <small>Available on every task</small>
        </div>
        <ExpressionInput
          label="Run condition"
          ariaLabel="Run condition"
          value={condition}
          placeholder="Optional runtime expression"
          onChange={setCondition}
          onBlur={(val) => applyField(['if'], (val !== undefined ? val : condition).trim() || undefined)}
          suggestions={['$context.ready === true', '$input.enabled', 'true']}
        />
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
            {availableNextTasks.map((taskName) => (
              <option key={taskName} value={taskName}>
                {taskName}
              </option>
            ))}
          </select>
        </label>
        <DurationField
          label="Timeout"
          value={timeout}
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
        <details className="inspector-parameter-section" aria-label="Document Functions">
          <summary>
            <span>Reusable functions</span>
            <small>use.functions ({functionEntries.length})</small>
          </summary>
          <div className="parameter-section-body">
            {functionEntries.map((entry, index) => (
              <div className="function-entry-card" key={`fn-${index}`}>
                <div className="function-entry-header">
                  <input
                    aria-label={`Function ${index + 1} name`}
                    placeholder="Function name"
                    value={entry.name}
                    onChange={(event) => {
                      const next = functionEntries.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: event.target.value } : item,
                      );
                      setFunctionEntries(next);
                    }}
                    onBlur={() => applyFunctionEntries(functionEntries)}
                  />
                  <button
                    type="button"
                    className="pair-remove"
                    aria-label={`Remove function ${index + 1}`}
                    onClick={() => {
                      const next = functionEntries.filter((_, itemIndex) => itemIndex !== index);
                      setFunctionEntries(next);
                      applyFunctionEntries(next);
                    }}
                  >
                    ×
                  </button>
                </div>
                <textarea
                  className="resize-none code-field"
                  aria-label={`Function ${index + 1} task JSON`}
                  rows={3}
                  value={entry.taskJson}
                  onChange={(event) => {
                    const next = functionEntries.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, taskJson: event.target.value } : item,
                    );
                    setFunctionEntries(next);
                  }}
                  onBlur={() => applyFunctionEntries(functionEntries)}
                  spellCheck="false"
                />
              </div>
            ))}
            <button
              type="button"
              className="pair-add"
              onClick={() => {
                const next = [
                  ...functionEntries,
                  {
                    name: `fn${functionEntries.length + 1}`,
                    taskJson: JSON.stringify({ set: { status: 'completed' } }, null, 2),
                  },
                ];
                setFunctionEntries(next);
                applyFunctionEntries(next);
              }}
            >
              ＋ Add reusable function
            </button>
          </div>
        </details>
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
