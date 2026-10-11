import { describe, expect, it } from 'vitest';
import { createDemoRuntimeAdapter } from './demoRuntime';
import { NEW_WORKFLOW, parseWorkflow } from './workflowModel';
import type { TaskItem, WorkflowDocument } from './types';

type RunStatus = {
  status: string;
  output?: Record<string, unknown>;
  failures: { message: string }[];
  tasks: { name: string; output: unknown }[];
};

function documentWith(tasks: TaskItem[]): WorkflowDocument {
  return { ...parseWorkflow(NEW_WORKFLOW).document, do: tasks };
}
async function settle(
  runtime: ReturnType<typeof createDemoRuntimeAdapter>,
  document: WorkflowDocument,
  input: Record<string, unknown> = {},
) {
  const started = (await runtime.start(document, input)) as { runId: string };
  let status = (await runtime.status(started.runId)) as RunStatus;
  for (let i = 0; i < 120 && status.status === 'running'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    status = (await runtime.status(started.runId)) as RunStatus;
  }
  return { status, runId: started.runId };
}

describe('demo control-flow and failure contracts', () => {
  it('evaluates input mappings, scalar expressions, arrays and equality without model calls', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const { status } = await settle(
      runtime,
      documentWith([
        {
          values: {
            set: {
              yes: '${true}',
              no: '${false}',
              nil: '${null}',
              number: '${-2.5}',
              same: '${2 === 2}',
              different: '${2 == 3}',
              copied: '${$input.name}',
              array: ['${$input.name}', '${true}'],
              plain: 'literal',
              expression: '${label}',
              input: '${$input}',
              short: '${.name}',
              missing: '${$context.absent.value}',
            },
          },
        },
      ]),
      { name: 'Ada' },
    );
    expect(status.status).toBe('completed');
    expect(status.output).toMatchObject({
      yes: true,
      no: false,
      nil: null,
      number: -2.5,
      same: true,
      different: false,
      copied: 'Ada',
      array: ['Ada', true],
      expression: 'label',
      input: { name: 'Ada' },
      short: 'Ada',
    });
  });
  it('runs fork branches, emits events, waits and catches a raised error', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const { status } = await settle(
      runtime,
      documentWith([
        {
          parallel: {
            fork: {
              branches: [
                { nested: { do: [{ branchValue: { set: { branchCompleted: true } } }] } },
                { request: { call: 'http', with: { method: 'get', endpoint: 'https://example.test' } } },
              ],
            },
          },
        },
        {
          recover: {
            try: [{ failure: { raise: { error: { type: 'https://example.test/error', status: 500 } } } }],
            catch: { do: [{ recovery: { set: { recovered: true } } }] },
          },
        },
        { delay: { wait: 'PT1S' } },
        {
          notification: {
            emit: { event: { with: { type: 'com.example.completed', source: 'https://example.test' } } },
          },
        },
      ]),
    );
    expect(status.status).toBe('completed');
    expect(status.output).toMatchObject({ branchCompleted: true, recovered: true });
    expect(status.tasks.map((task) => task.name)).toEqual(
      expect.arrayContaining(['branchValue', 'request', 'failure', 'recovery', 'delay', 'notification']),
    );
  });
  it('keeps uncaught errors and runaway transitions observable', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const failed = await settle(
      runtime,
      documentWith([
        {
          failure: { raise: { error: { type: 'https://example.test/error', status: 500 } } },
        },
      ]),
    );
    expect(failed.status.status).toBe('failed');
    expect(failed.status.failures[0].message).toContain('https://example.test/error');
    const loop = await settle(
      runtime,
      documentWith([{ repeat: { set: { attempted: true }, then: 'repeat' } }]),
    );
    expect(loop.status.status).toBe('failed');
    expect(loop.status.failures[0].message).toContain('possible workflow loop');
    await expect(runtime.status('missing-run')).rejects.toThrow('not found');
  });
  it('records scheduled and event triggers while preserving listener outputs', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const scheduled = await settle(runtime, {
      ...documentWith([{ ready: { set: { ready: true } } }]),
      schedule: { every: 'PT5M' },
    });
    expect(await runtime.logs(scheduled.runId)).toContain('trigger=schedule:PT5M');
    for (const to of [
      { one: { with: { type: 'com.example.received' } } },
      { any: [{ with: { source: 'https://example.test' } }] },
    ]) {
      const event = await settle(runtime, documentWith([{ receive: { listen: { to } } }]));
      expect(event.status.status).toBe('completed');
      expect(await runtime.logs(event.runId)).toContain('trigger=event:');
    }
  });
  it('marks simulated scripts and unknown subflows as demo outputs', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const result = await settle(
      runtime,
      documentWith([
        { script: { run: { script: { language: 'javascript', code: '() => 1' } } } },
        { custom: { run: { workflow: { namespace: 'custom', name: 'unregistered', version: '1.0.0' } } } },
        { ai: { run: { workflow: { namespace: 'ai', name: 'unregistered', version: '1.0.0' } } } },
      ]),
    );
    expect(result.status.status).toBe('completed');
    expect(result.status.output?.script).toMatchObject({ demo: true });
    expect(result.status.output?.custom).toMatchObject({ demo: true });
    expect(result.status.output?.ai).toMatchObject({
      demo: true,
      model: 'default-model',
      llmResult: '[mock-llm] ',
    });
    const scalarRuntime = createDemoRuntimeAdapter({ stepDelay: 0, executeScript: async () => 'scalar' });
    const scalar = await settle(
      scalarRuntime,
      documentWith([{ script: { run: { script: { language: 'javascript', code: '() => "scalar"' } } } }]),
    );
    expect(scalar.status.output?.script).toEqual({ demo: true, scriptResult: 'scalar' });
  });
  it('retains supplied model and prompt in fallback mocks and supports completed-run cancellation', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 1 });
    const result = await settle(
      runtime,
      documentWith([
        { ai: { run: { workflow: { namespace: 'ai', name: 'unregistered', version: '1.0.0' } } } },
      ]),
      { prompt: 'hello', model: 'fixture-model' },
    );
    expect(result.status.output?.ai).toMatchObject({ llmResult: '[mock-llm] hello', model: 'fixture-model' });
    await runtime.cancel(result.runId);
    expect(((await runtime.status(result.runId)) as RunStatus).status).toBe('completed');
  });
});
