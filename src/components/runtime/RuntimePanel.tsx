import { useState, useMemo, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
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
import type { WorkflowDocument } from '../../types';
import { RuntimeLogList } from './RuntimeLogList';

export interface RuntimePanelProps {
  document: WorkflowDocument;
  side?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Workspace sub-flow documents the demo engine can execute on delegation. */
  subflowDocuments?: WorkflowDocument[];
  onRunStatusChange?: (status: Record<string, unknown> | null) => void;
  /** Reports gateway connectivity (null = no gateway configured) for the status bar. */
  onHealthChange?: (healthy: boolean | null, latencyMs?: number) => void;
}

export function RuntimePanel({
  document,
  side = false,
  open,
  onOpenChange,
  onRunStatusChange,
  onHealthChange,
  subflowDocuments = [],
}: RuntimePanelProps) {
  const [demoDelay, setDemoDelay] = useState(500);
  // The adapter snapshots sub-flow documents at run start (getter → ref), so
  // later workspace edits never disturb an in-flight demo run.
  const subflowDocsRef = useRef<WorkflowDocument[]>(subflowDocuments);
  subflowDocsRef.current = subflowDocuments;
  const demoRuntime = useMemo(
    () =>
      createDemoRuntimeAdapter({
        stepDelay: demoDelay,
        executeScript: executeNodeSandboxScript,
        subflowDocuments: () => subflowDocsRef.current,
      }),
    [demoDelay],
  );
  const [gatewayUrl, setGatewayUrl] = useState<string>(() => {
    return (
      window.localStorage.getItem('open-workflow-gateway-url') ||
      (import.meta as unknown as { env: Record<string, string> }).env?.VITE_RUNTIME_GATEWAY_URL?.trim() ||
      ''
    );
  });
  const [authToken, setAuthToken] = useState<string>(() => {
    return window.localStorage.getItem('open-workflow-gateway-token') || '';
  });
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [gatewayMetrics, setGatewayMetrics] = useState<{
    latencyMs?: number;
    uptimeMs?: number;
    activeRuns?: number;
  } | null>(null);

  const handleUpdateGatewayUrl = (url: string) => {
    setGatewayUrl(url);
    if (url) window.localStorage.setItem('open-workflow-gateway-url', url);
    else window.localStorage.removeItem('open-workflow-gateway-url');
  };

  const handleUpdateAuthToken = (token: string) => {
    setAuthToken(token);
    if (token) window.localStorage.setItem('open-workflow-gateway-token', token);
    else window.localStorage.removeItem('open-workflow-gateway-token');
  };

  // Reflect gateway configuration changes made from the Settings dialog.
  useEffect(() => {
    const syncGatewayConfig = () => {
      const url = window.localStorage.getItem('open-workflow-gateway-url') || '';
      const token = window.localStorage.getItem('open-workflow-gateway-token') || '';
      setGatewayUrl(url);
      setAuthToken(token);
      // A configured URL implies the user wants the gateway connection mode on.
      if (url) setRuntimeMode('gateway');
    };
    window.addEventListener('open-workflow:gateway-config-changed', syncGatewayConfig);
    return () => window.removeEventListener('open-workflow:gateway-config-changed', syncGatewayConfig);
  }, []);

  const checkHealth = useCallback(async () => {
    if (!gatewayUrl) {
      setGatewayOnline(null);
      setGatewayMetrics(null);
      onHealthChange?.(null);
      return;
    }
    const start = performance.now();
    try {
      const headers: Record<string, string> = authToken
        ? { authorization: `Bearer ${authToken.trim()}` }
        : {};
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/health`, { headers });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        const data = (await res.json()) as { uptimeMs?: number; activeRuns?: number };
        setGatewayOnline(true);
        setGatewayMetrics({
          latencyMs: latency,
          uptimeMs: data.uptimeMs,
          activeRuns: data.activeRuns,
        });
        onHealthChange?.(true, latency);
      } else {
        setGatewayOnline(false);
        setGatewayMetrics(null);
        onHealthChange?.(false, latency);
      }
    } catch {
      setGatewayOnline(false);
      setGatewayMetrics(null);
      onHealthChange?.(false);
    }
  }, [gatewayUrl, authToken, onHealthChange]);

  useEffect(() => {
    let cancelled = false;
    const runCheck = async () => {
      if (!cancelled) await checkHealth();
    };
    runCheck();
    const timer = setInterval(runCheck, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkHealth]);

  const gatewayRuntime = useMemo(() => {
    if (!gatewayUrl) return null;
    try {
      return createHttpRuntimeAdapter({ baseUrl: gatewayUrl, authToken });
    } catch (error) {
      return { configurationError: error };
    }
  }, [gatewayUrl, authToken]);
  const [runtimeMode, setRuntimeMode] = useState<'demo' | 'gateway'>('demo');
  const [inputs, setInputs] = useState('{\n  "nolTagId": "0123456789",\n  "channel": "nol-pay"\n}');
  const [runId, setRunId] = useState('');
  const [runStatus, setRunStatus] = useState<Record<string, unknown> | null>(null);
  const [runLogs, setRunLogs] = useState('');
  const [runError, setRunError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [internalOpen, setInternalOpen] = useState(side);
  const isOpen = open ?? internalOpen;
  const runtime = runtimeMode === 'demo' ? demoRuntime : gatewayRuntime;
  const gatewayAvailable = Boolean(
    gatewayRuntime && !(gatewayRuntime as { configurationError?: unknown }).configurationError,
  );

  const resetRun = useCallback(() => {
    setRunId('');
    setRunStatus(null);
    setRunLogs('');
    setRunError('');
  }, []);

  useEffect(() => {
    onRunStatusChange?.(runStatus);
  }, [runStatus, onRunStatusChange]);

  const changeRuntimeMode = (mode: 'demo' | 'gateway') => {
    setRuntimeMode(mode);
    resetRun();
  };

  const changeDemoDelay = (event: ChangeEvent<HTMLSelectElement>) => {
    setDemoDelay(Number(event.target.value));
    resetRun();
  };

  const refreshRun = useCallback(async () => {
    if (!runId || !runtime || (runtime as { configurationError?: unknown }).configurationError) return;
    try {
      const [status, logs] = await Promise.all([
        (runtime as { status: (id: string) => Promise<Record<string, unknown>> }).status(runId),
        (runtime as { logs: (id: string) => Promise<string> }).logs(runId),
      ]);
      setRunStatus(status);
      setRunLogs(typeof logs === 'string' ? logs : JSON.stringify(logs, null, 2));
      setRunError('');
    } catch (error: unknown) {
      setRunError((error as Error).message || 'Could not refresh the workflow run.');
    }
  }, [runId, runtime]);

  useEffect(() => {
    if (
      !runId ||
      !runtime ||
      (runtime as { configurationError?: unknown }).configurationError ||
      isTerminalRuntimeState(runtimeState(runStatus))
    )
      return;
    const pollInterval = runtimeMode === 'demo' ? Math.max(250, demoDelay) : 1500;
    const timer = window.setInterval(refreshRun, pollInterval);
    return () => window.clearInterval(timer);
  }, [demoDelay, refreshRun, runId, runStatus, runtime, runtimeMode]);

  const startRun = async () => {
    if (!runtime || (runtime as { configurationError?: unknown }).configurationError) return;
    let parsedInputs: unknown;
    try {
      parsedInputs = JSON.parse(inputs || '{}');
    } catch {
      setRunError('Run inputs must be valid JSON.');
      return;
    }
    setIsStarting(true);
    setRunError('');
    try {
      const result = await (
        runtime as { start: (doc: WorkflowDocument, input?: unknown) => Promise<Record<string, unknown>> }
      ).start(document, parsedInputs);
      const nextRunId = runtimeRunId(result);
      if (!nextRunId) throw new Error('Runtime did not return a run identifier.');
      setRunId(String(nextRunId));
      setRunStatus(result);
      setRunLogs('');
    } catch (error: unknown) {
      setRunError((error as Error).message || 'Could not start the workflow.');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelRun = async () => {
    if (!runId || !runtime || (runtime as { configurationError?: unknown }).configurationError) return;
    try {
      await (runtime as { cancel: (id: string) => Promise<void> }).cancel(runId);
      await refreshRun();
    } catch (error: unknown) {
      setRunError((error as Error).message || 'Could not cancel the workflow run.');
    }
  };

  const rawProgress = (runStatus?.tasks || runStatus?.taskProgress || runStatus?.steps || []) as
    | Array<{
        id?: string;
        name?: string;
        task?: string;
        status?: string;
        state?: string;
        type?: string;
        durationMs?: number;
      }>
    | Record<
        string,
        {
          id?: string;
          name?: string;
          task?: string;
          status?: string;
          state?: string;
          type?: string;
          durationMs?: number;
        }
      >;
  const progressItems: Array<{
    id?: string;
    name?: string;
    task?: string;
    status?: string;
    state?: string;
    type?: string;
    durationMs?: number;
  }> = Array.isArray(rawProgress)
    ? rawProgress
    : Object.entries(rawProgress || {}).map(([name, value]) => ({ name, ...value }));
  const failureValue = runStatus?.failures || runStatus?.failure;
  const failureItems = Array.isArray(failureValue) ? failureValue : failureValue ? [failureValue] : [];
  const retryCount = (runStatus?.retries ?? runStatus?.retryCount) as number | undefined;
  const runOutput = (runStatus?.output as Record<string, unknown> | undefined) ?? undefined;
  const runOutputKeys =
    runOutput && typeof runOutput === 'object' && !Array.isArray(runOutput) ? Object.keys(runOutput) : [];
  const status = runtimeState(runStatus);
  const completedCount = progressItems.filter((item) =>
    ['completed', 'complete'].includes(String(item.status || item.state).toLowerCase()),
  ).length;
  const activeTask: { name?: string; type?: string } | undefined =
    (runStatus?.activeTask as { name?: string; type?: string } | undefined) ||
    progressItems.find((item) =>
      ['running', 'active'].includes(String(item.status || item.state).toLowerCase()),
    );
  const elapsedMs =
    (runStatus?.durationMs as number | undefined) ??
    (runStatus?.startedAt ? Date.now() - new Date(String(runStatus.startedAt)).getTime() : undefined);

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
        <span
          className="runtime-summary-title"
          title={isOpen ? 'Collapse Runtime' : 'Expand Runtime'}
          onClick={toggleOpen}
        >
          <i className={`runtime-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true" />
          <i
            className={`runtime-dot ${runtime && !(runtime as { configurationError?: unknown }).configurationError ? 'connected' : ''}`}
          />
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
                : (runtime as { configurationError?: unknown }).configurationError
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
          {runtimeMode === 'gateway' && (
            <div
              className="gateway-status-banner"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--bg-surface-soft)',
                border: '1px solid var(--line)',
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        gatewayOnline === true
                          ? 'var(--green)'
                          : gatewayOnline === false
                            ? 'var(--red)'
                            : 'var(--muted)',
                    }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {gatewayOnline === true
                      ? 'Gateway Online'
                      : gatewayOnline === false
                        ? 'Gateway Disconnected'
                        : 'Checking gateway…'}
                  </span>
                </div>
                {gatewayMetrics?.latencyMs !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                    {gatewayMetrics.latencyMs}ms
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  fontSize: 10,
                  color: 'var(--muted)',
                }}
              >
                <span style={{ fontFamily: 'DM Mono, monospace' }}>
                  {gatewayUrl || 'No gateway URL configured'}
                </span>
                {gatewayMetrics?.activeRuns !== undefined && <span>Runs: {gatewayMetrics.activeRuns}</span>}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: '1px solid var(--line)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowGatewayConfig((c) => !c)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--blue)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showGatewayConfig ? '▾ Hide settings' : '▸ Gateway settings'}
                </button>
                <button
                  type="button"
                  onClick={checkHealth}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: 10,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Test ping
                </button>
              </div>
              {showGatewayConfig && (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: 9 }}>Gateway Base URL</span>
                    <input
                      aria-label="Gateway Base URL"
                      value={gatewayUrl}
                      onChange={(e) => handleUpdateGatewayUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8091"
                      style={{ height: 26, fontSize: 11 }}
                    />
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: 9 }}>Bearer Token (Optional)</span>
                    <input
                      type="password"
                      aria-label="Gateway Bearer Token"
                      value={authToken}
                      onChange={(e) => handleUpdateAuthToken(e.target.value)}
                      placeholder="secret-token..."
                      style={{ height: 26, fontSize: 11 }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          {runtimeMode === 'gateway' && (!gatewayUrl || !runtime) ? (
            <div className="runtime-empty" role="status">
              <strong>No runtime gateway connected</strong>
              <p>Set the public VITE_RUNTIME_GATEWAY_URL or enter a gateway URL in settings above.</p>
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
                    // Scoped demo-engine ids (`<task>/subflow/<name>/<step>`) give
                    // executed sub-flow steps their path context (plain names can
                    // repeat across sub-flows).
                    const itemScope =
                      item.id && item.id !== itemName && item.id.includes('/') ? item.id : null;
                    return (
                      <div
                        className={`runtime-progress-item runtime-progress-${itemStatus}`}
                        key={item.id || item.name || index}
                      >
                        <i aria-hidden="true" />
                        <span>
                          <b>{itemName}</b>
                          <small>
                            {itemScope || item.type || 'task'}
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
              {runOutputKeys.length > 0 && isTerminalRuntimeState(status) && (
                <div className="runtime-output">
                  <div className="runtime-section-head">
                    <strong>Run output</strong>
                    <small>{runOutputKeys.length} keys</small>
                  </div>
                  <pre>{JSON.stringify(runOutput, null, 2)}</pre>
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
