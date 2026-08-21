import { describe, expect, it } from 'vitest';
import { COMPLEX_WORKFLOW } from './fixtures/complexWorkflow';
import {
  publicRuntimeConfig,
  readRuntimeGatewayConfig,
  runtimeRequestHeaders,
} from '../server/runtimeGatewayConfig';
import { assertRuntimeAdapter, createHttpRuntimeAdapter, createRuntimeAdapter } from './runtimeAdapter';
import { createDemoRuntimeAdapter } from './demoRuntime';
import {
  SANDBOX_LIMITS,
  createSandboxRequestHandler,
  runSandboxedJavaScript,
} from '../server/javascriptSandbox';
import {
  createWorkflowRecord,
  createWorkflowPersistence,
  assertWorkflowPersistence,
  parseWorkflowLibrary,
  removeWorkflowRecord,
  serializeWorkflowLibrary,
  uniqueWorkflowName,
  upsertWorkflowRecord,
  replaceWorkflowRecordsWithState,
} from './workflowStore';
import {
  addTopLevelTask,
  autoLayoutFlow,
  connectTopLevelTasks,
  createFlowGraph,
  duplicateTopLevelTask,
  disconnectTopLevelTasks,
  NEW_WORKFLOW,
  parseWorkflow,
  removeTopLevelTask,
  SAMPLE_WORKFLOW,
  SMART_CITY_WORKFLOWS,
  serializeWorkflow,
  TASK_TEMPLATES,
  updateTopLevelTaskConfig,
  updateTopLevelTaskName,
  updateTopLevelTaskField,
  validateGraph,
} from './workflowModel';

describe('workflow model adapter', () => {
  it('runs restricted JavaScript in the Node sandbox boundary', async () => {
    await expect(
      runSandboxedJavaScript({
        code: '({ input, context, catalogs }) => ({ total: input.amount * 1.05, ready: context.ready, catalog: Object.keys(catalogs)[0] })',
        input: { amount: 100 },
        context: { ready: true },
        catalogs: { services: { endpoint: 'https://catalog.example' } },
      }),
    ).resolves.toEqual({ total: 105, ready: true, catalog: 'services' });

    await expect(
      runSandboxedJavaScript({ code: '({ input }) => process.env.SECRET', input: {}, context: {} }),
    ).rejects.toMatchObject({ code: 'SANDBOX_BLOCKED_CAPABILITY' });

    await expect(
      runSandboxedJavaScript({
        code: '({ input }) => { while (true) {} }',
        limits: { timeoutMs: 50 },
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_TIMEOUT' });
  });

  it('exposes the sandbox as a small JSON HTTP boundary', async () => {
    const response = {
      setHeader: () => {},
      end: (value) => {
        response.body = value;
      },
    };
    const request = {
      method: 'POST',
      url: '/api/sandbox/javascript',
      setEncoding: () => {},
      on: (event, handler) => {
        if (event === 'data')
          handler(
            JSON.stringify({ code: '({ input }) => ({ ok: input.value === true })', input: { value: true } }),
          );
        if (event === 'end') handler();
      },
      once: (event, handler) => {
        if (event === 'end') handler();
      },
    };
    const handled = await createSandboxRequestHandler()(request, response);

    expect(handled).toBe(true);
    expect(JSON.parse(response.body)).toEqual({ ok: true, result: { ok: true } });
    expect(SANDBOX_LIMITS.maxCodeBytes).toBeGreaterThan(1000);
  });

  it('parses a workflow, builds a graph, and round-trips YAML', () => {
    const parsed = parseWorkflow(COMPLEX_WORKFLOW);
    const flow = createFlowGraph(parsed.document);
    const roundTrip = parseWorkflow(serializeWorkflow(parsed.document));

    expect(parsed.document.document.name).toBe('branching-release');
    expect(flow.nodes.some((node) => node.data.taskType === 'switch')).toBe(true);
    expect(flow.nodes.some((node) => node.data.taskType === 'do')).toBe(true);
    expect(roundTrip.document.do).toHaveLength(3);
    expect(parseWorkflow(serializeWorkflow(parsed.document, 'json')).document.document.name).toBe(
      'branching-release',
    );
  });

  it('keeps the sample workflow free of retired product branding', () => {
    expect(SAMPLE_WORKFLOW).not.toMatch(/atlas/i);
    expect(SAMPLE_WORKFLOW).toContain('namespace: dubai-government');
  });

  it('computes a deterministic layout position for every graph node', async () => {
    const document = parseWorkflow(SAMPLE_WORKFLOW).document;
    const positions = await autoLayoutFlow(document);

    expect(Object.keys(positions).length).toBeGreaterThan(2);
    expect(positions['root-entry-node']).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it('accepts an empty workflow and produces start/end ports', () => {
    const parsed = parseWorkflow(NEW_WORKFLOW);
    const flow = createFlowGraph(parsed.document);

    expect(parsed.document.do).toEqual([]);
    expect(flow.nodes.map((node) => node.id)).toEqual(['root-entry-node', 'root-exit-node']);
  });

  it('creates schema-valid templates for every supported palette task', () => {
    let document = parseWorkflow(NEW_WORKFLOW).document;
    Object.keys(TASK_TEMPLATES).forEach((taskType) => {
      document = addTopLevelTask(document, taskType);
    });

    expect(parseWorkflow(serializeWorkflow(document)).document.do).toHaveLength(
      Object.keys(TASK_TEMPLATES).length,
    );
  });

  it('renames, edits, removes, connects, and disconnects top-level tasks', () => {
    let document = parseWorkflow(SAMPLE_WORKFLOW).document;
    document = updateTopLevelTaskName(document, '/do/checkTravelPassExpiry', 'prepareRenewalCheck');
    document = updateTopLevelTaskConfig(document, '/do/prepareRenewalCheck', { set: { ready: true } });
    document = connectTopLevelTasks(document, '/do/prepareRenewalCheck', '/do/verifyNolAccount');

    expect(document.do[0].prepareRenewalCheck).toEqual({
      set: { ready: true },
      then: 'verifyNolAccount',
    });

    document = disconnectTopLevelTasks(document, '/do/prepareRenewalCheck', '/do/verifyNolAccount');
    document = removeTopLevelTask(document, '/do/prepareRenewalCheck');
    expect(document.do.some((item) => item.prepareRenewalCheck)).toBe(false);
  });

  it('rejects a connection that would create a cycle', () => {
    let document = parseWorkflow(NEW_WORKFLOW).document;
    document.do = [
      { first: { set: { value: 1 } } },
      { second: { set: { value: 2 } } },
      { third: { set: { value: 3 } } },
    ];
    document = connectTopLevelTasks(document, '/do/first', '/do/second');
    document = connectTopLevelTasks(document, '/do/second', '/do/third');
    const cycled = connectTopLevelTasks(document, '/do/third', '/do/first');

    expect(cycled.do[2].third.then).toBeUndefined();
  });

  it('duplicates a task with a unique name and no copied outgoing edge', () => {
    let document = parseWorkflow(SAMPLE_WORKFLOW).document;
    document = connectTopLevelTasks(document, '/do/checkTravelPassExpiry', '/do/verifyNolAccount');
    const duplicate = duplicateTopLevelTask(document, '/do/checkTravelPassExpiry');

    expect(duplicate.do[1]['checkTravelPassExpiry-copy']).toEqual({
      set: { renewalDue: true, nolTagId: '0123456789', passDuration: '30-days' },
    });
    expect(duplicate.do[0].checkTravelPassExpiry.then).toBe('verifyNolAccount');
    expect(parseWorkflow(serializeWorkflow(duplicate)).document.do).toHaveLength(9);
  });

  it('reports graph-level dangling references and cycles', () => {
    const document = parseWorkflow(NEW_WORKFLOW).document;
    document.do = [
      { first: { set: { value: 1 }, then: 'missing' } },
      { second: { set: { value: 2 }, then: 'third' } },
      { third: { set: { value: 3 }, then: 'second' } },
    ];

    const issues = validateGraph(document);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/do/first/then' }),
        expect.objectContaining({ message: 'The workflow contains a cycle.' }),
      ]),
    );
  });

  it('updates a nested task field while keeping the document schema-valid', () => {
    const document = parseWorkflow(SAMPLE_WORKFLOW).document;
    const updated = updateTopLevelTaskField(document, '/do/verifyNolAccount', ['with', 'method'], 'put');

    const verifyNolAccount = updated.do.find((item) => item.verifyNolAccount)?.verifyNolAccount;
    const roundTripped = parseWorkflow(serializeWorkflow(updated)).document;
    const roundTrippedVerify = roundTripped.do.find((item) => item.verifyNolAccount)?.verifyNolAccount;
    expect(verifyNolAccount.with.method).toBe('put');
    expect(roundTrippedVerify.with.method).toBe('put');
  });

  it('reports tasks made unreachable by an explicit transition', () => {
    const document = parseWorkflow(NEW_WORKFLOW).document;
    document.do = [
      { first: { set: { value: 1 }, then: 'third' } },
      { second: { set: { value: 2 } } },
      { third: { set: { value: 3 } } },
    ];

    expect(validateGraph(document)).toEqual([
      { path: '/do/second', message: 'Task is unreachable from the workflow start.' },
    ]);
  });

  it('keeps common task fields schema-valid when edited through the adapter', () => {
    let document = parseWorkflow(NEW_WORKFLOW).document;
    document = addTopLevelTask(document, 'set');
    document = updateTopLevelTaskField(document, '/do/setTask', ['if'], '${ $context.enabled }');
    document = updateTopLevelTaskField(document, '/do/setTask', ['input'], { from: '${ $context.input }' });
    document = updateTopLevelTaskField(document, '/do/setTask', ['output'], { as: '${ $context.output }' });
    document = updateTopLevelTaskField(document, '/do/setTask', ['export'], { as: '${ $context.exported }' });
    document = updateTopLevelTaskField(document, '/do/setTask', ['timeout'], 'short-timeout');
    document = updateTopLevelTaskField(document, '/do/setTask', ['metadata'], { owner: 'editor' });

    expect(parseWorkflow(serializeWorkflow(document)).document.do[0].setTask.metadata).toEqual({
      owner: 'editor',
    });
  });

  it('exposes runtime operations only as an explicit disconnected boundary', async () => {
    const runtime = createRuntimeAdapter();

    await expect(runtime.start()).rejects.toThrow('No workflow runtime is connected');
    expect(Object.keys(runtime)).toEqual(['validate', 'start', 'status', 'cancel', 'logs']);
    expect(() => assertRuntimeAdapter({})).toThrow('Runtime adapter is missing');
  });

  it('runs the sample workflow through the local demo engine', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const workflow = parseWorkflow(SAMPLE_WORKFLOW).document;
    const started = await runtime.start(workflow, { demo: true });
    let status = await runtime.status(started.runId);

    for (let attempt = 0; attempt < 20 && status.status === 'running'; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = await runtime.status(started.runId);
    }

    expect(status).toEqual(expect.objectContaining({ status: 'completed', demo: true, runtime: 'demo' }));
    expect(status.tasks.map((task) => task.name)).toEqual([
      'checkTravelPassExpiry',
      'verifyNolAccount',
      'calculateRenewalDecision',
      'renewTravelPass',
      'payTravelPassFees',
      'activateAtMetroGate',
      'notifyPassenger',
      'recordRenewalOutcome',
    ]);
    const logs = await runtime.logs(started.runId);
    expect(logs).toContain('Completed local demo run');
    expect(logs).toContain('Mocked call rta-nol-travel-pass-service');
    expect(logs).toContain('durationMs=');
    expect(status.tasks[0]).toEqual(expect.objectContaining({ type: 'set', durationMs: expect.any(Number) }));
  });

  it('keeps every Dubai Government example valid and runnable', async () => {
    for (const example of SMART_CITY_WORKFLOWS) {
      const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
      const workflow = parseWorkflow(example.specification).document;
      expect(validateGraph(workflow)).toEqual([]);

      const started = await runtime.start(workflow, { demo: true });
      let status = await runtime.status(started.runId);
      for (let attempt = 0; attempt < 30 && status.status === 'running'; attempt += 1) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        status = await runtime.status(started.runId);
      }

      expect(status.status, example.id).toBe('completed');
      const logs = await runtime.logs(started.runId);
      if (example.id === 'rta-nol-travel-pass-renewal') {
        expect(logs).toContain('trigger=schedule:PT24H');
      }
      if (example.id === 'rta-vehicle-ownership-renewal') {
        expect(logs).toContain('trigger=event:com.dubai.rta.vehicle.renewal.requested');
        expect(logs).toContain('Received event in listenForVehicleRenewalEvent');
      }
    }
  });

  it('maps runtime operations to the server-side gateway without carrying credentials', async () => {
    const requests = [];
    const runtime = createHttpRuntimeAdapter({
      baseUrl: 'https://gateway.example.test/',
      headers: { 'x-editor-client': 'open-workflow-editor' },
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true }),
        };
      },
    });

    await runtime.validate({ document: { name: 'demo' } });
    await runtime.start({ document: { name: 'demo' } }, { enabled: true });
    await runtime.status('run/1');
    await runtime.cancel('run/1');
    await runtime.logs('run/1');

    expect(requests.map(({ url }) => url)).toEqual([
      'https://gateway.example.test/validate',
      'https://gateway.example.test/runs',
      'https://gateway.example.test/runs/run%2F1',
      'https://gateway.example.test/runs/run%2F1',
      'https://gateway.example.test/runs/run%2F1/logs',
    ]);
    expect(requests[0].options.headers).not.toHaveProperty('authorization');
    expect(requests[1].options.body).toContain('"inputs":{"enabled":true}');
    expect(requests[3].options.method).toBe('DELETE');
  });

  it('keeps runtime credentials server-side', () => {
    const config = readRuntimeGatewayConfig({
      OPEN_WORKFLOW_RUNTIME_BASE_URL: 'https://runtime.example.test/',
      OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN: 'secret-token',
      OPEN_WORKFLOW_RUNTIME_NAME: 'Reference runtime',
    });

    expect(config.baseUrl).toBe('https://runtime.example.test');
    expect(runtimeRequestHeaders(config).authorization).toBe('Bearer secret-token');
    expect(publicRuntimeConfig(config)).toEqual({
      enabled: true,
      baseUrl: 'https://runtime.example.test',
      name: 'Reference runtime',
    });
    expect(publicRuntimeConfig(config)).not.toHaveProperty('authToken');
    expect(() => readRuntimeGatewayConfig({ OPEN_WORKFLOW_RUNTIME_BASE_URL: 'file:///tmp/runtime' })).toThrow(
      'must use http or https',
    );
  });

  it('keeps nested and event/error task forms schema-valid', () => {
    let document = parseWorkflow(NEW_WORKFLOW).document;
    document = addTopLevelTask(document, 'do');
    document = updateTopLevelTaskField(document, '/do/doTask', ['do'], [{ child: { set: { value: 1 } } }]);
    document = addTopLevelTask(document, 'emit');
    document = updateTopLevelTaskField(document, '/do/emitTask', ['emit', 'event', 'with', 'data'], {
      ok: true,
    });
    document = addTopLevelTask(document, 'raise');
    document = updateTopLevelTaskField(document, '/do/raiseTask', ['raise', 'error', 'detail'], 'failed');

    const restored = parseWorkflow(serializeWorkflow(document)).document;
    expect(restored.do[0].doTask.do[0].child.set.value).toBe(1);
    expect(restored.do[1].emitTask.emit.event.with.data.ok).toBe(true);
    expect(restored.do[2].raiseTask.raise.error.detail).toBe('failed');
  });

  it('round-trips a versioned workflow library and preserves lifecycle operations', () => {
    const document = parseWorkflow(NEW_WORKFLOW).document;
    const first = createWorkflowRecord({
      id: 'first',
      document,
      specification: serializeWorkflow(document),
      positions: { 'root-entry-node': { x: 1, y: 2 } },
    });
    const second = { ...first, id: 'second', name: 'second-workflow' };
    const library = upsertWorkflowRecord(upsertWorkflowRecord([], first), second);
    const restored = parseWorkflowLibrary(serializeWorkflowLibrary(library));

    expect(restored).toHaveLength(2);
    expect(restored[0].positions['root-entry-node']).toEqual({ x: 1, y: 2 });
    expect(uniqueWorkflowName(restored, 'second-workflow')).toBe('second-workflow-2');
    expect(removeWorkflowRecord(restored, 'first')).toHaveLength(1);
  });

  it('provides a storage seam that can be replaced by an API adapter', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const persistence = createWorkflowPersistence(storage, 'library');
    expect(assertWorkflowPersistence(persistence)).toBe(persistence);
    expect(() => assertWorkflowPersistence({})).toThrow('Workflow persistence is missing');
    const document = parseWorkflow(NEW_WORKFLOW).document;
    const record = createWorkflowRecord({
      id: 'workflow',
      document,
      specification: serializeWorkflow(document),
    });

    persistence.replace([record]);
    expect(persistence.list()).toHaveLength(1);
    persistence.clear();
    expect(persistence.list()).toEqual([]);
  });

  it('exposes saving, saved, and error transitions for async persistence', async () => {
    const states = [];
    const persistence = { replace: async () => undefined };
    await replaceWorkflowRecordsWithState(persistence, [], (state) => states.push(state.status));
    expect(states).toEqual(['saving', 'saved']);

    const failures = [];
    const failingPersistence = {
      replace: async () => {
        throw new Error('network unavailable');
      },
    };
    await expect(
      replaceWorkflowRecordsWithState(failingPersistence, [], (state) => failures.push(state)),
    ).rejects.toThrow('network unavailable');
    expect(failures.at(-1)).toEqual(expect.objectContaining({ status: 'error' }));
  });
});
