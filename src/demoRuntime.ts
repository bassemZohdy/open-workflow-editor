import { validate as validateWorkflow } from '@openworkflowspec/sdk';
import { assertRuntimeAdapter } from './runtimeAdapter';
import type { EventFilter, TaskDefinition, TaskItem, WorkflowDocument } from './types';

interface DemoTaskProgress {
  id: string;
  name: string;
  type: string;
  status: string;
  retries: number;
  output?: unknown;
  next?: string;
  error?: string;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
}

interface DemoActiveTask {
  id: string;
  name: string;
  type: string;
  scope: string;
  startedAt: string;
}

interface ScriptExecutionPayload {
  code: string;
  language: string;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  catalogs: Record<string, unknown>;
}

type ScriptExecutor = (payload: ScriptExecutionPayload) => Promise<unknown>;

interface DemoRun {
  runId: string;
  status: string;
  runtime: 'demo';
  demo: boolean;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  catalogs: Record<string, unknown>;
  tasks: DemoTaskProgress[];
  failures: Array<{ message: string }>;
  retries: number;
  logs: string[];
  stepDelay: number;
  startedAt: string;
  startedAtMs: number;
  activeTask: DemoActiveTask | null;
  cancelRequested: boolean;
  executeScript?: ScriptExecutor;
  output?: unknown;
  endedAt?: string;
  durationMs?: number;
}

const clone = <T>(value: T): T => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))) as T;
const pause = (milliseconds: number): Promise<void> =>
  milliseconds > 0
    ? new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
    : Promise.resolve();

function taskEntries(taskList: TaskItem[] = []): Array<{ name: string; definition: TaskDefinition }> {
  return taskList.flatMap((item) =>
    Object.entries(item || {}).map(([name, definition]) => ({ name, definition: definition || {} })),
  );
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) => (current as Record<string, unknown> | undefined | null)?.[key],
      value,
    );
}

function evaluateValue(value: unknown, context: { context: unknown; input: unknown }): unknown {
  if (Array.isArray(value)) return value.map((item) => evaluateValue(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, evaluateValue(item, context)]),
    );
  }
  if (typeof value !== 'string') return value;

  const expression = value.match(/^\$\{\s*(.*?)\s*\}$/)?.[1];
  if (!expression) return value;
  if (expression === 'true') return true;
  if (expression === 'false') return false;
  if (expression === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(expression)) return Number(expression);

  const equality = expression.split(/\s*(===|==)\s*/);
  if (equality.length === 3) {
    return evaluateValue(`\${${equality[0]}}`, context) === evaluateValue(`\${${equality[2]}}`, context);
  }
  if (expression.startsWith('$context.'))
    return readPath(context.context, expression.slice('$context.'.length));
  if (expression.startsWith('$input.')) return readPath(context.input, expression.slice('$input.'.length));
  if (expression === '$context') return context.context;
  if (expression === '$input') return context.input;
  if (expression.startsWith('.')) return readPath(context.context, expression.slice(1));
  return expression;
}

function evaluateCondition(value: unknown, context: { context: unknown; input: unknown }): boolean {
  const result = evaluateValue(value, context);
  return result === true || result === 'true';
}

function demoValidation(workflow: WorkflowDocument) {
  validateWorkflow('Workflow', workflow);
  return {
    valid: true,
    runtime: { name: 'Open Workflow Demo Engine', version: '0.1.0' },
  };
}

function workflowTrigger(workflow: WorkflowDocument): string {
  if (workflow.schedule) {
    const schedule = workflow.schedule;
    const value = schedule.every || schedule.cron || schedule.after;
    return `schedule:${value || 'configured'}`;
  }
  const firstTask = taskEntries(workflow.do || [])[0]?.definition;
  if (firstTask?.listen) {
    const eventFilter: EventFilter | undefined =
      firstTask.listen.to?.one?.with || firstTask.listen.to?.any?.[0]?.with;
    return `event:${eventFilter?.type || 'configured'}`;
  }
  return 'manual';
}

function addLog(run: DemoRun, message: string, details: Record<string, unknown> = {}): void {
  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ')}`)
    .join(' ');
  run.logs.push(`[${new Date().toISOString()}] ${message}${detailText ? ` · ${detailText}` : ''}`);
}

function ensureActive(run: DemoRun): void {
  if (run.cancelRequested) throw new Error('Demo run cancelled.');
}

function createTaskProgress(
  run: DemoRun,
  id: string,
  name: string,
  definition: TaskDefinition,
): DemoTaskProgress {
  const progress: DemoTaskProgress = {
    id,
    name,
    type: Object.keys(definition)[0] || 'unknown',
    status: 'pending',
    retries: 0,
  };
  run.tasks.push(progress);
  return progress;
}

async function executeTaskList(taskList: TaskItem[] | undefined, run: DemoRun, scope = ''): Promise<void> {
  const entries = taskEntries(taskList || []);
  const byName = new Map(entries.map((entry, index) => [entry.name, index]));
  let index = 0;
  let transitions = 0;

  while (index < entries.length) {
    ensureActive(run);
    if (transitions++ > 100) throw new Error('Demo engine stopped a possible workflow loop.');
    const { name, definition } = entries[index];
    const progress = createTaskProgress(run, `${scope}${name}`, name, definition);
    const startedAtMs = Date.now();
    progress.status = 'running';
    progress.startedAt = new Date().toISOString();
    run.activeTask = {
      id: progress.id,
      name,
      type: progress.type,
      scope,
      startedAt: progress.startedAt,
    };
    addLog(run, `Started task ${scope}${name}`, { type: progress.type });

    try {
      await pause(run.stepDelay);
      const result = await executeTask(name, definition, run, scope);
      progress.status = 'completed';
      progress.output = clone(result.output);
      progress.next = result.next;
      progress.durationMs = Date.now() - startedAtMs;
      progress.endedAt = new Date().toISOString();
      addLog(run, `Completed task ${scope}${name}`, {
        type: progress.type,
        durationMs: progress.durationMs,
        next: result.next || 'end',
      });
      run.activeTask = null;
      if (result.next && byName.has(result.next)) {
        index = byName.get(result.next) as number;
      } else {
        index += 1;
      }
    } catch (error) {
      progress.status = run.cancelRequested ? 'cancelled' : 'failed';
      progress.error = error instanceof Error ? error.message : String(error);
      progress.durationMs = Date.now() - startedAtMs;
      progress.endedAt = new Date().toISOString();
      run.activeTask = null;
      addLog(run, `Failed task ${scope}${name}`, {
        type: progress.type,
        durationMs: progress.durationMs,
        error: progress.error,
      });
      throw error;
    }
  }
}

async function executeTask(
  name: string,
  definition: TaskDefinition,
  run: DemoRun,
  scope: string,
): Promise<{ output: unknown; next?: string }> {
  const context = { context: run.context, input: run.input };
  if (definition.set) {
    const values = evaluateValue(definition.set, context) as Record<string, unknown>;
    Object.assign(run.context, values);
    addLog(run, `Updated context in ${scope}${name}`, { keys: Object.keys(values).join(',') });
    return { output: values, next: definition.then };
  }
  if (definition.call) {
    const request = evaluateValue(definition.with || {}, context) as Record<string, unknown>;
    addLog(run, `Mocked call ${definition.call}`, {
      method: request.method || 'get',
      endpoint: request.endpoint || 'not-specified',
    });
    return {
      output: {
        demo: true,
        call: definition.call,
        request,
        response: { status: 200, ok: true },
      },
      next: definition.then,
    };
  }
  if (definition.switch) {
    const selected = definition.switch.find((item) => {
      const clause = Object.values(item || {})[0] || {};
      return clause.when === undefined || evaluateCondition(clause.when, context);
    });
    const clause = selected ? Object.values(selected)[0] || {} : {};
    addLog(run, `Selected branch in ${scope}${name}`, {
      branch: selected ? Object.keys(selected)[0] : 'none',
      next: clause.then || 'end',
    });
    return { output: { demo: true, branch: selected ? Object.keys(selected)[0] : null }, next: clause.then };
  }
  if (definition.do) {
    await executeTaskList(definition.do, run, `${scope}${name}/`);
    return { output: { demo: true, nested: true }, next: definition.then };
  }
  if (definition.for) {
    const collection = evaluateValue(definition.for.in, context);
    const items = Array.isArray(collection) ? collection : [];
    for (let index = 0; index < items.length; index += 1) {
      run.context[definition.for.each || 'item'] = items[index];
      await executeTaskList(definition.do || [], run, `${scope}${name}[${index}]/`);
    }
    return { output: { demo: true, iterations: items.length }, next: definition.then };
  }
  if (definition.fork) {
    const branches = definition.fork.branches || [];
    addLog(run, `Opening ${branches.length} fork branches in ${scope}${name}`);
    for (const branch of branches) {
      const [branchName, branchTask] = Object.entries(branch || {})[0] || [];
      addLog(run, `Starting fork branch ${scope}${name}/${branchName}`);
      const branchTasks = branchTask?.do ? branchTask.do : [{ [branchName]: branchTask }];
      await executeTaskList((branchTasks as TaskItem[]).filter(Boolean), run, `${scope}${name}/${branchName}/`);
    }
    return { output: { demo: true, branches: branches.length }, next: definition.then };
  }
  if (definition.try) {
    try {
      await executeTaskList(definition.try, run, `${scope}${name}/try/`);
    } catch (error) {
      if (!definition.catch?.do) throw error;
      await executeTaskList(definition.catch.do, run, `${scope}${name}/catch/`);
    }
    return { output: { demo: true, handled: true }, next: definition.then };
  }
  if (definition.raise) throw new Error(definition.raise.error?.type || `Task ${name} raised an error.`);
  if (definition.wait) {
    addLog(run, `Waiting in ${scope}${name}`, { duration: definition.wait });
    return { output: { demo: true, waited: definition.wait }, next: definition.then };
  }
  if (definition.emit) {
    addLog(run, `Emitted event from ${scope}${name}`, {
      type: definition.emit.event?.with?.type || 'unknown',
    });
    return { output: { demo: true, event: evaluateValue(definition.emit, context) }, next: definition.then };
  }
  if (definition.listen) {
    const eventFilter = definition.listen.to?.one?.with || definition.listen.to?.any?.[0]?.with;
    addLog(run, `Received event in ${scope}${name}`, {
      source: eventFilter?.source || 'configured',
      type: eventFilter?.type || 'configured',
    });
    return { output: { demo: true, eventReceived: true, event: eventFilter }, next: definition.then };
  }
  if (definition.run?.script) {
    const script = definition.run.script;
    if (typeof run.executeScript === 'function') {
      const result = await run.executeScript({
        code: script.code as string,
        language: script.language as string,
        input: run.input,
        context: run.context,
        catalogs: run.catalogs,
      });
      if (result && typeof result === 'object' && !Array.isArray(result)) Object.assign(run.context, result);
      addLog(run, `Executed JavaScript in Node sandbox for ${scope}${name}`, {
        language: script.language,
        output: JSON.stringify(result),
      });
      return { output: { sandbox: 'node', result }, next: definition.then };
    }
    addLog(run, `Simulated JavaScript in ${scope}${name}`, {
      language: script.language || 'javascript',
      code: script.code || 'not-specified',
    });
    return { output: { demo: true, script: definition.run }, next: definition.then };
  }
  if (definition.run?.workflow) {
    const subflow = definition.run.workflow;
    addLog(run, `Simulated sub-flow ${scope}${name}`, {
      target: `${subflow.namespace}/${subflow.name}@${subflow.version}`,
    });
    return { output: { demo: true, subflow }, next: definition.then };
  }
  return { output: { demo: true, task: name }, next: definition.then };
}

export interface DemoRuntimeOptions {
  stepDelay?: number;
  executeScript?: ScriptExecutor;
}

export function createDemoRuntimeAdapter({ stepDelay = 180, executeScript }: DemoRuntimeOptions = {}) {
  const runs = new Map<string, DemoRun>();
  let sequence = 0;

  const validate = async (workflow: WorkflowDocument) => demoValidation(workflow);

  const start = async (workflow: WorkflowDocument, inputs: Record<string, unknown> = {}) => {
    demoValidation(workflow);
    const runId = `demo-run-${++sequence}`;
    const run: DemoRun = {
      runId,
      status: 'running',
      runtime: 'demo',
      demo: true,
      input: clone(inputs) || {},
      context: clone(inputs) || {},
      catalogs: clone(workflow.use?.catalogs || {}),
      tasks: [],
      failures: [],
      retries: 0,
      logs: [],
      stepDelay,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now(),
      activeTask: null,
      cancelRequested: false,
      executeScript,
    };
    runs.set(runId, run);
    addLog(run, `Started local demo run ${runId}`, {
      workflow: workflow.document?.name || 'workflow',
      trigger: workflowTrigger(workflow),
      stepDelayMs: stepDelay,
    });

    void executeTaskList(workflow.do || [], run)
      .then(() => {
        if (run.cancelRequested) return;
        run.status = 'completed';
        run.output = clone(run.context);
        run.endedAt = new Date().toISOString();
        run.durationMs = Date.now() - run.startedAtMs;
        addLog(run, `Completed local demo run ${runId}`, {
          tasks: run.tasks.length,
          durationMs: run.durationMs,
        });
      })
      .catch((error: unknown) => {
        run.status = run.cancelRequested ? 'cancelled' : 'failed';
        run.failures.push({ message: error instanceof Error ? error.message : String(error) });
        run.endedAt = new Date().toISOString();
        run.durationMs = Date.now() - run.startedAtMs;
        addLog(run, `${run.status === 'cancelled' ? 'Cancelled' : 'Failed'} local demo run ${runId}`, {
          durationMs: run.durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return { runId, status: run.status, runtime: 'demo', demo: true };
  };

  const getRun = (runId: string): DemoRun => {
    const run = runs.get(String(runId));
    if (!run) throw new Error(`Demo run ${runId} was not found.`);
    return run;
  };

  const status = async (runId: string) => clone(getRun(runId));
  const cancel = async (runId: string) => {
    const run = getRun(runId);
    if (run.status === 'running') {
      run.cancelRequested = true;
      addLog(run, `Cancellation requested for ${run.runId}`, {
        activeTask: run.activeTask?.name || 'none',
      });
    }
    return { runId: run.runId, status: 'cancellation-requested', demo: true };
  };
  const logs = async (runId: string) => getRun(runId).logs.join('\n');

  return assertRuntimeAdapter({ validate, start, status, cancel, logs });
}
