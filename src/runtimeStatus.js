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

export {
  runtimeRunId,
  runtimeState,
  isTerminalRuntimeState,
  isActiveRuntimeState,
  formatRuntimeDuration,
  runtimeLogCount,
  parseRuntimeLogs,
  executeNodeSandboxScript,
};
