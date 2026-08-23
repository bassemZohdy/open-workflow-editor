import { describe, expect, it } from 'vitest';
import { createDemoRuntimeAdapter } from './demoRuntime';
import { NEW_WORKFLOW, parseWorkflow } from './workflowModel';
import type { WorkflowDocument } from './types';

interface DemoStatusShape {
  status: string;
  output?: Record<string, unknown>;
  tasks: Array<{ id: string; name: string; type: string }>;
  failures: Array<{ message: string }>;
  logs: string[];
}

async function startAndSettle(
  runtime: ReturnType<typeof createDemoRuntimeAdapter>,
  workflow: WorkflowDocument,
  inputs: Record<string, unknown> = {},
): Promise<{ runId: string; status: DemoStatusShape }> {
  const started = (await runtime.start(workflow, inputs)) as { runId: string };
  let status = (await runtime.status(started.runId)) as DemoStatusShape;
  for (let attempt = 0; attempt < 60 && status.status === 'running'; attempt += 1) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    status = (await runtime.status(started.runId)) as DemoStatusShape;
  }
  return { runId: started.runId, status };
}

describe('demo engine cancellation reaches sub-flows (Task 59)', () => {
  it('cancels a run while a sub-flow document is executing', async () => {
    const subflow: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'dubai-government', name: 'long-billing', version: '0.1.0' },
      do: [
        { warmUp: { set: { ready: true } } },
        {
          requestCancel: { run: { script: { language: 'javascript', code: 'await runtime.cancel(runId)' } } },
        },
        { afterCancel: { set: { shouldNeverRun: true } } },
      ],
    };
    let runId = '';
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      subflowDocuments: [subflow],
      executeScript: async () => {
        await runtime.cancel(runId);
        return { cancellationRequested: true };
      },
    });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        {
          callBilling: {
            run: { workflow: { namespace: 'dubai-government', name: 'long-billing', version: '0.1.0' } },
          },
        },
        { neverReached: { set: { nope: true } } },
      ],
    };

    const started = (await runtime.start(workflow, {})) as { runId: string };
    runId = started.runId;
    let status = (await runtime.status(runId)) as DemoStatusShape;
    for (let attempt = 0; attempt < 60 && status.status === 'running'; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = (await runtime.status(runId)) as DemoStatusShape;
    }

    expect(status.status).toBe('cancelled');
    expect(status.failures[0]?.message).toBe('Demo run cancelled.');
    expect(status.output).toBeUndefined();
    const taskIds = status.tasks.map((task) => task.id);
    expect(taskIds).toContain('callBilling/subflow/long-billing/requestCancel');
    expect(taskIds).not.toContain('callBilling/subflow/long-billing/afterCancel');
    expect(status.tasks.map((task) => task.name)).not.toContain('neverReached');
  });
});

describe('demo engine delegation sentinels survive colliding sub-flow keys (Task 60)', () => {
  it('keeps demo/executed/subflow sentinels and preserves the user values', async () => {
    const subflow: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'acme', name: 'sentinel-hijack', version: '0.2.0' },
      do: [
        {
          initSubflow: {
            set: { executed: false, subflow: 'hijacked', demo: 'user-value', realValue: 'kept' },
          },
        },
      ],
    };
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0, subflowDocuments: [subflow] });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        {
          delegate: {
            run: { workflow: { namespace: 'acme', name: 'sentinel-hijack', version: '0.2.0' } },
          },
        },
      ],
    };

    const { status } = await startAndSettle(runtime, workflow);
    expect(status.status).toBe('completed');
    const delegated = status.output?.['delegate'] as Record<string, unknown>;
    expect(delegated.demo).toBe(true);
    expect(delegated.executed).toBe(true);
    expect(delegated.subflow).toBe('acme/sentinel-hijack@0.2.0');
    expect(delegated.realValue).toBe('kept');
    expect(delegated.subflowSet).toEqual({
      executed: false,
      subflow: 'hijacked',
      demo: 'user-value',
    });
  });
});

describe('demo engine script flat merge cannot clobber task outputs (Task 64)', () => {
  it('skips keys colliding with earlier task-keyed outputs while merging plain keys', async () => {
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      executeScript: async (payload) =>
        payload.code.includes('loadUser')
          ? { name: 'Ada', role: 'admin' }
          : { loadUser: 'corrupted', freshKey: 'kept' },
    });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        { loadUser: { run: { script: { language: 'javascript', code: '// loadUser' } } } },
        { corruptAttempt: { run: { script: { language: 'javascript', code: '// corruptAttempt' } } } },
      ],
    };

    const { status } = await startAndSettle(runtime, workflow);
    expect(status.status).toBe('completed');
    expect(status.output?.['loadUser']).toEqual({ name: 'Ada', role: 'admin' });
    expect(status.output?.['freshKey']).toBe('kept');
    expect(status.output?.['corruptAttempt']).toEqual({ loadUser: 'corrupted', freshKey: 'kept' });
  });
});
