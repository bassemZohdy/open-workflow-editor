import { useState, useEffect } from 'react';
import {
  updateTopLevelTaskConfig,
  updateTopLevelTaskField,
  updateTopLevelTaskName,
} from '../../workflowModel';
import { formatError, formatJsonInput, objectToPairs, objectToCatalogEntries } from '../../formatters';
import { taskColors } from '../../taskMeta';
import { validateJavaScriptFunction } from '../../scriptContract';
import {
  JsonObjectBuilder,
  objectToJsonBuilderEntries,
  jsonBuilderEntriesToObject,
} from '../common/JsonObjectBuilder';
import { DurationField } from '../common/DurationField';
import { KeyValuePairs, pairsToObject } from '../common/KeyValuePairs';

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
    // Form state intentionally resets on selection change only (tracked via
    // selectedSignature), not on every document edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSignature]);

  const catalogSignature = JSON.stringify(document?.use?.catalogs || {});
  useEffect(() => {
    setCatalogEntries(objectToCatalogEntries(document?.use?.catalogs));
    // Catalog form state resets when the catalog shape changes, not when the
    // parent document object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export { Inspector };
