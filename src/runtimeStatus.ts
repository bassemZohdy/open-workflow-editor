/** A run-shaped result from either runtime adapter (demo or gateway). */
export interface RuntimeResultLike {
  runId?: string;
  id?: string;
  instanceId?: string;
  workflowInstanceId?: string;
  status?: string;
  state?: string;
  phase?: string;
}

export interface RuntimeLogEntry {
  id: string;
  timestamp: string;
  summary: string;
  detail: string;
  raw: string;
}

interface SandboxResponse {
  ok?: boolean;
  error?: string;
  result?: unknown;
}

function runtimeRunId(result: RuntimeResultLike | undefined | null): string {
  return result?.runId || result?.id || result?.instanceId || result?.workflowInstanceId || '';
}

function runtimeState(result: RuntimeResultLike | undefined | null): string {
  return String(result?.status || result?.state || result?.phase || 'unknown').toLowerCase();
}

const TERMINAL_RUNTIME_STATES = [
  'completed',
  'complete',
  'failed',
  'failure',
  'error',
  'aborted',
  'cancelled',
  'canceled',
];

function isTerminalRuntimeState(state: string): boolean {
  return TERMINAL_RUNTIME_STATES.includes(state);
}

function isActiveRuntimeState(state: string): boolean {
  return ['queued', 'pending', 'starting', 'running', 'in_progress', 'in-progress'].includes(state);
}

function formatRuntimeDuration(milliseconds?: number): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return '—';
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function runtimeLogCount(logs: string): number {
  return logs ? logs.split('\n').filter(Boolean).length : 0;
}

function parseRuntimeLogs(logs: string): RuntimeLogEntry[] {
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

async function executeNodeSandboxScript(payload: unknown): Promise<unknown> {
  const response = await fetch('/api/sandbox/javascript', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result: SandboxResponse = await response.json().catch(() => ({}));
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
