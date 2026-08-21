import { useState, useMemo, useEffect, useCallback } from 'react';
import { createHttpRuntimeAdapter } from '../../runtimeAdapter';
import { createDemoRuntimeAdapter } from '../../demoRuntime';
import {
  runtimeRunId,
  runtimeState,
  isTerminalRuntimeState,
  isActiveRuntimeState,
  formatRuntimeDuration,
  runtimeLogCount,
  executeNodeSandboxScript,
} from '../../runtimeStatus';
import { RuntimeLogList } from './RuntimeLogList';

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

export { RuntimePanel };