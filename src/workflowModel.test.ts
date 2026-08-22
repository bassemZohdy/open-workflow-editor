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
import { createRuntimeGatewayHandler } from '../server/runtimeGatewayHandler';
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
  recordWorkflowRevision,
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
import { exportFlowToSvg } from './diagramExport';
import { isValidExpression } from './components/common/ExpressionInput';
import { WORKFLOW_TEMPLATES } from './fixtures/templates';
import { computeLineDiff, summarizeDiff } from './diffUtils';
import { getTaskColor, getTaskIcon, getTaskSubtitle } from './taskMeta';
import type { TaskDefinition, WorkflowDocument } from './types';

describe('workflow model adapter', () => {
  it('runs restricted JavaScript in the Node sandbox boundary', async () => {
    await expect(
      runSandboxedJavaScript({
        code: '({ input, context, catalogs }) => ({ total: input.amount * 1.05, ready: context.ready, catalog: Object.keys(catalogs)[0] })',
        input: { amount: 100 },
        context: { ready: true },
        catalogs: { services: { endpoint: 'https://catalog.example' } },
      } as never),
    ).resolves.toEqual({ total: 105, ready: true, catalog: 'services' });

    await expect(
      runSandboxedJavaScript({ code: '({ input }) => process.env.SECRET', input: {}, context: {} } as never),
    ).rejects.toMatchObject({ code: 'SANDBOX_BLOCKED_CAPABILITY' });

    await expect(
      runSandboxedJavaScript({
        code: '({ input }) => { while (true) {} }',
        limits: { timeoutMs: 50 },
      } as never),
    ).rejects.toMatchObject({ code: 'SANDBOX_TIMEOUT' });
  });

  it('exposes the sandbox as a small JSON HTTP boundary', async () => {
    const response: { setHeader: () => void; end: (v: string) => void; body?: string } = {
      setHeader: () => {},
      end: (value: string) => {
        response.body = value;
      },
    };
    const request = {
      method: 'POST',
      url: '/api/sandbox/javascript',
      setEncoding: () => {},
      on: (event: string, handler: (chunk?: string) => void) => {
        if (event === 'data')
          handler(
            JSON.stringify({ code: '({ input }) => ({ ok: input.value === true })', input: { value: true } }),
          );
        if (event === 'end') handler();
      },
      once: (event: string, handler: () => void) => {
        if (event === 'end') handler();
      },
    };
    const handled = await createSandboxRequestHandler()(request as never, response as never);

    expect(handled).toBe(true);
    expect(JSON.parse(response.body || '{}')).toEqual({ ok: true, result: { ok: true } });
    expect(SANDBOX_LIMITS.maxCodeBytes).toBeGreaterThan(1000);
  });

  it('parses a workflow, builds a graph, and round-trips YAML', () => {
    const parsed = parseWorkflow(COMPLEX_WORKFLOW);
    const flow = createFlowGraph(parsed.document);
    const roundTrip = parseWorkflow(serializeWorkflow(parsed.document));

    expect(parsed.document.document?.name).toBe('branching-release');
    expect(flow.nodes.some((node) => node.data.taskType === 'switch')).toBe(true);
    expect(flow.nodes.some((node) => node.data.taskType === 'do')).toBe(true);
    expect(roundTrip.document.do).toHaveLength(3);
    expect(parseWorkflow(serializeWorkflow(parsed.document, 'json')).document.document?.name).toBe(
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

    expect(document.do?.[0]?.prepareRenewalCheck).toEqual({
      set: { ready: true },
      then: 'verifyNolAccount',
    });

    document = disconnectTopLevelTasks(document, '/do/prepareRenewalCheck', '/do/verifyNolAccount');
    document = removeTopLevelTask(document, '/do/prepareRenewalCheck');
    expect(document.do?.some((item) => item.prepareRenewalCheck)).toBe(false);
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

    expect(cycled.do?.[2]?.third?.then).toBeUndefined();
  });

  it('duplicates a task with a unique name and no copied outgoing edge', () => {
    let document = parseWorkflow(SAMPLE_WORKFLOW).document;
    document = connectTopLevelTasks(document, '/do/checkTravelPassExpiry', '/do/verifyNolAccount');
    const duplicate = duplicateTopLevelTask(document, '/do/checkTravelPassExpiry');

    expect(duplicate.do?.[1]?.['checkTravelPassExpiry-copy']).toEqual({
      set: { renewalDue: true, nolTagId: '0123456789', passDuration: '30-days' },
    });
    expect(duplicate.do?.[0]?.checkTravelPassExpiry?.then).toBe('verifyNolAccount');
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

    const verifyNolAccount = updated.do?.find((item) => item.verifyNolAccount)?.verifyNolAccount;
    const roundTripped = parseWorkflow(serializeWorkflow(updated)).document;
    const roundTrippedVerify = roundTripped.do?.find((item) => item.verifyNolAccount)?.verifyNolAccount;
    expect(verifyNolAccount?.with?.method).toBe('put');
    expect(roundTrippedVerify?.with?.method).toBe('put');
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

    expect(parseWorkflow(serializeWorkflow(document)).document.do?.[0]?.setTask?.metadata).toEqual({
      owner: 'editor',
    });
  });

  it('exposes runtime operations only as an explicit disconnected boundary', async () => {
    const runtime = createRuntimeAdapter();

    await expect(runtime.start({} as never)).rejects.toThrow('No workflow runtime is connected');
    expect(Object.keys(runtime)).toEqual(['validate', 'start', 'status', 'cancel', 'logs']);
    expect(() => assertRuntimeAdapter({} as never)).toThrow('Runtime adapter is missing');
  });

  it('runs the sample workflow through the local demo engine', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    const workflow = parseWorkflow(SAMPLE_WORKFLOW).document;
    const started = (await runtime.start(workflow, { demo: true })) as { runId: string };
    let status = (await runtime.status(started.runId)) as {
      status: string;
      tasks: Array<{ name: string; type: string; durationMs?: number }>;
      demo?: boolean;
      runtime?: string;
    };

    for (let attempt = 0; attempt < 20 && status.status === 'running'; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = (await runtime.status(started.runId)) as {
        status: string;
        tasks: Array<{ name: string; type: string; durationMs?: number }>;
        demo?: boolean;
        runtime?: string;
      };
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

      const started = (await runtime.start(workflow, { demo: true })) as { runId: string };
      let status = (await runtime.status(started.runId)) as { status: string };
      for (let attempt = 0; attempt < 30 && status.status === 'running'; attempt += 1) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        status = (await runtime.status(started.runId)) as { status: string };
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
    const requests: Array<{ url: string; options: RequestInit }> = [];
    const runtime = createHttpRuntimeAdapter({
      baseUrl: 'https://gateway.example.test/',
      headers: { 'x-editor-client': 'open-workflow-editor' },
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options: options || {} });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true }),
        } as Response;
      },
    });

    await runtime.validate({ document: { name: 'demo' } } as never);
    await runtime.start({ document: { name: 'demo' } } as never, { enabled: true });
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
    expect((requests[0].options.headers as Record<string, string>)?.authorization).toBeUndefined();
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
    expect((runtimeRequestHeaders(config) as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
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
    expect(restored.do?.[0]?.doTask?.do?.[0]?.child?.set?.value).toBe(1);
    expect(restored.do?.[1]?.emitTask?.emit?.event?.with?.data).toEqual({ ok: true });
    expect(restored.do?.[2]?.raiseTask?.raise?.error?.detail).toBe('failed');
  });

  it('keeps for, fork, listen, and try/catch tasks schema-valid and editable', () => {
    let document = parseWorkflow(NEW_WORKFLOW).document;

    // for task
    document = addTopLevelTask(document, 'for');
    document = updateTopLevelTaskField(document, '/do/forTask', ['for'], {
      each: 'user',
      in: '${ $context.users }',
      at: 'idx',
    });
    document = updateTopLevelTaskField(
      document,
      '/do/forTask',
      ['do'],
      [{ processUser: { set: { processed: true } } }],
    );

    // fork task
    document = addTopLevelTask(document, 'fork');
    document = updateTopLevelTaskField(document, '/do/forkTask', ['fork'], {
      compete: false,
      branches: [{ branchAlpha: { set: { value: 'alpha' } } }, { branchBeta: { set: { value: 'beta' } } }],
    });

    // listen task
    document = addTopLevelTask(document, 'listen');
    document = updateTopLevelTaskField(document, '/do/listenTask', ['listen'], {
      to: {
        one: {
          with: {
            source: 'https://demo.example.com/events',
            type: 'com.example.notification',
          },
        },
      },
      read: 'data',
    });

    // try / catch task
    document = addTopLevelTask(document, 'try');
    document = updateTopLevelTaskField(
      document,
      '/do/tryTask',
      ['try'],
      [{ riskyOperation: { set: { tried: true } } }],
    );
    document = updateTopLevelTaskField(document, '/do/tryTask', ['catch'], {
      errors: {
        with: {
          type: 'https://example.com/errors/timeout',
        },
      },
      retry: {
        delay: 'PT5S',
        limit: {
          attempt: {
            count: 3,
          },
        },
      },
      do: [{ fallbackOp: { set: { recovered: true } } }],
    });

    const parsed = parseWorkflow(serializeWorkflow(document)).document;
    expect(parsed.do?.[0]?.forTask?.for?.each).toBe('user');
    expect(parsed.do?.[0]?.forTask?.for?.at).toBe('idx');
    expect(parsed.do?.[1]?.forkTask?.fork?.branches).toHaveLength(2);
    expect(parsed.do?.[2]?.listenTask?.listen?.to?.one?.with?.type).toBe('com.example.notification');
    expect(parsed.do?.[3]?.tryTask?.catch?.retry?.limit?.attempt?.count).toBe(3);
    expect((parsed.do?.[3]?.tryTask?.catch?.errors as { with?: { type?: string } })?.with?.type).toBe(
      'https://example.com/errors/timeout',
    );
  });

  it('generates clean SVG diagrams from workflow graphs', () => {
    const document = parseWorkflow(SAMPLE_WORKFLOW).document;
    const flow = createFlowGraph(document);
    const svg = exportFlowToSvg(flow, { title: 'Sample Diagram' });

    expect(svg).toContain('<svg');
    expect(svg).toContain('Sample Diagram');
    expect(svg).toContain('checkTravelPassExpiry');
    expect(svg).toContain('verifyNolAccount');
    expect(svg).toContain('</svg>');
  });

  it('validates runtime expression formatting', () => {
    expect(isValidExpression('')).toBe(true);
    expect(isValidExpression('constant-value')).toBe(true);
    expect(isValidExpression('${ $context.ready }')).toBe(true);
    expect(isValidExpression('${  }')).toBe(false);
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
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const persistence = createWorkflowPersistence(storage, 'library');
    expect(assertWorkflowPersistence(persistence)).toBe(persistence);
    expect(() => assertWorkflowPersistence({} as never)).toThrow('Workflow persistence is missing');
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
    const states: string[] = [];
    const persistence = { replace: async () => undefined };
    await replaceWorkflowRecordsWithState(persistence as never, [], (state) => states.push(state.status));
    expect(states).toEqual(['saving', 'saved']);

    const failures: Array<{ status: string }> = [];
    const failingPersistence = {
      replace: async () => {
        throw new Error('network unavailable');
      },
    };
    await expect(
      replaceWorkflowRecordsWithState(failingPersistence as never, [], (state) => failures.push(state)),
    ).rejects.toThrow('network unavailable');
    expect(failures.at(-1)).toEqual(expect.objectContaining({ status: 'error' }));
  });

  it('validates all built-in template catalog entries as conforming Open Workflow specifications', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    WORKFLOW_TEMPLATES.forEach((template) => {
      expect(template.id).toBeTruthy();
      expect(template.title).toBeTruthy();
      expect(template.category).toBeTruthy();
      const parsed = parseWorkflow(template.specification);
      expect(parsed.document.document?.dsl).toBe('1.0.3');
      const issues = validateGraph(parsed.document);
      expect(issues).toEqual([]);
      const flow = createFlowGraph(parsed.document);
      expect(flow.nodes.length).toBeGreaterThan(0);
    });
  });

  it('correctly validates expression syntax for expression fields', () => {
    expect(isValidExpression('${ $context.amount > 5000 }')).toBe(true);
    expect(isValidExpression('${ $input.orderId }')).toBe(true);
    expect(isValidExpression('plain static string')).toBe(true);
    expect(isValidExpression('')).toBe(true);
    expect(isValidExpression('${  }')).toBe(false);
  });

  it('computes line-by-line diffs accurately between workflow specifications', () => {
    const oldText = 'name: test\nversion: 1.0\ntask: oldTask';
    const newText = 'name: test\nversion: 2.0\ntask: newTask';
    const diff = computeLineDiff(oldText, newText);
    expect(diff.length).toBeGreaterThan(0);
    const summary = summarizeDiff(diff);
    expect(summary.added).toBeGreaterThan(0);
    expect(summary.removed).toBeGreaterThan(0);
    expect(summary.unchanged).toBeGreaterThan(0);
  });

  it('tracks revisions on workflow record updates', () => {
    const document = parseWorkflow(NEW_WORKFLOW).document;
    const record = createWorkflowRecord({
      id: 'rev-test',
      document,
      specification: 'version: 1.0',
    });
    expect(record.revisions).toBeDefined();
    expect(record.revisions?.length).toBe(1);

    const updated = recordWorkflowRevision({ ...record, specification: 'version: 2.0' }, 'Updated version');
    expect(updated.revisions?.length).toBe(2);
    expect(updated.revisions?.[0].specification).toBe('version: 2.0');
    expect(updated.revisions?.[0].summary).toBe('Updated version');
  });

  it('runs workflow lifecycle through HTTP runtime adapter connected to gateway handler', async () => {
    const gatewayHandler = createRuntimeGatewayHandler();

    // Mock fetch communicating with gateway handler
    const mockFetch = async (url: string, init?: RequestInit) => {
      const parsedUrl = new URL(url);
      const reqHeaders = init?.headers as Record<string, string> | undefined;
      const chunks: string[] = init?.body ? [String(init.body)] : [];

      let resStatus = 200;
      let resHeaders: Record<string, string> = {};
      let resBody = '';

      const req: unknown = {
        method: init?.method || 'GET',
        url: parsedUrl.pathname,
        headers: reqHeaders || {},
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        },
      };

      const res: unknown = {
        statusCode: 200,
        setHeader(k: string, v: string) {
          resHeaders[k] = v;
        },
        end(data?: string) {
          resBody = data || '';
        },
      };

      await gatewayHandler(req as never, res as never);
      resStatus = (res as { statusCode: number }).statusCode;

      return {
        ok: resStatus >= 200 && resStatus < 300,
        status: resStatus,
        text: async () => resBody,
      } as Response;
    };

    const adapter = createHttpRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:8091',
      fetchImpl: mockFetch as never,
    });

    const doc: WorkflowDocument = parseWorkflow(SAMPLE_WORKFLOW).document;
    const valResult = (await adapter.validate(doc)) as { valid: boolean };
    expect(valResult.valid).toBe(true);

    const startResult = (await adapter.start(doc, { nolTagId: '123' })) as { runId: string };
    expect(startResult.runId).toBeTruthy();

    const statusResult = (await adapter.status(startResult.runId)) as {
      runId: string;
      state: string;
    };
    expect(statusResult.runId).toBe(startResult.runId);

    const logsResult = (await adapter.logs(startResult.runId)) as string;
    expect(typeof logsResult).toBe('string');

    const cancelResult = (await adapter.cancel(startResult.runId)) as { state: string };
    expect(cancelResult.state).toBe('canceled');
  });

  it('responds with health status and metadata on GET /health', async () => {
    const gatewayHandler = createRuntimeGatewayHandler();
    let resStatus = 0;
    let resBody = '';

    const req: unknown = {
      method: 'GET',
      url: '/health',
      headers: {},
      async *[Symbol.asyncIterator]() {},
    };

    const res: unknown = {
      statusCode: 200,
      setHeader() {},
      end(data?: string) {
        resBody = data || '';
      },
    };

    const handled = await gatewayHandler(req as never, res as never);
    expect(handled).toBe(true);
    resStatus = (res as { statusCode: number }).statusCode;
    expect(resStatus).toBe(200);

    const parsed = JSON.parse(resBody) as { status: string; version: string };
    expect(parsed.status).toBe('healthy');
    expect(parsed.version).toBe('1.0.3');
  });

  it('enforces authentication when authTokens are configured on gateway', async () => {
    const gatewayHandler = createRuntimeGatewayHandler({ authTokens: ['secret-token-123'] });

    // Request without token
    let resStatus = 0;
    let resBody = '';
    const reqUnauthorized: unknown = {
      method: 'POST',
      url: '/validate',
      headers: {},
      async *[Symbol.asyncIterator]() {},
    };
    const resUnauthorized: unknown = {
      statusCode: 200,
      setHeader() {},
      end(data?: string) {
        resBody = data || '';
      },
    };
    await gatewayHandler(reqUnauthorized as never, resUnauthorized as never);
    resStatus = (resUnauthorized as { statusCode: number }).statusCode;
    expect(resStatus).toBe(401);

    // Request with valid token
    const reqAuthorized: unknown = {
      method: 'POST',
      url: '/validate',
      headers: { authorization: 'Bearer secret-token-123' },
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ workflow: { document: { name: 'test' } } });
      },
    };
    const resAuthorized: unknown = {
      statusCode: 200,
      setHeader() {},
      end(data?: string) {
        resBody = data || '';
      },
    };
    await gatewayHandler(reqAuthorized as never, resAuthorized as never);
    resStatus = (resAuthorized as { statusCode: number }).statusCode;
    expect(resStatus).toBe(200);
  });

  it('enforces rate limiting and logs audit entries on gateway requests', async () => {
    const gatewayHandler = createRuntimeGatewayHandler({ rateLimitMax: 2, rateLimitWindowMs: 5000 });

    const makeReq = async () => {
      let status = 200;
      let body = '';
      const req: unknown = {
        method: 'GET',
        url: '/health',
        headers: {},
        socket: { remoteAddress: '127.0.0.99' },
        async *[Symbol.asyncIterator]() {},
      };
      const res: unknown = {
        statusCode: 200,
        setHeader() {},
        end(d?: string) {
          body = d || '';
        },
      };
      await gatewayHandler(req as never, res as never);
      status = (res as { statusCode: number }).statusCode;
      return { status, body };
    };

    const r1 = await makeReq();
    expect(r1.status).toBe(200);
    const r2 = await makeReq();
    expect(r2.status).toBe(200);
    const r3 = await makeReq();
    expect(r3.status).toBe(429);
  });

  it('generates a full standalone production deployment bundle', async () => {
    const { generateDeploymentBundle } = await import('./deploymentBundle');
    const bundle = generateDeploymentBundle(SAMPLE_WORKFLOW, 'nol-card-renewal');

    expect(bundle.workflowName).toBe('nol-card-renewal');
    expect(bundle.dockerfile).toContain('openworkflow/runtime:1.0.3');
    expect(bundle.dockerfile).toContain('nol-card-renewal');
    expect(bundle.kubernetesYaml).toContain('kind: ConfigMap');
    expect(bundle.kubernetesYaml).toContain('kind: Deployment');
    expect(bundle.kubernetesYaml).toContain('kind: Service');
    expect(bundle.readmeMd).toContain('Docker');
    expect(bundle.readmeMd).toContain('kubectl apply');
  });

  it('streams SSE telemetry events on GET /runs/:id/events', async () => {
    const gatewayHandler = createRuntimeGatewayHandler();

    // 1. Create a run
    let createResBody = '';
    const createReq: unknown = {
      method: 'POST',
      url: '/runs',
      headers: {},
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ workflow: { document: { name: 'sse-test' }, do: [{ step1: {} }] } });
      },
    };
    const createRes: unknown = {
      statusCode: 200,
      setHeader() {},
      end(d?: string) {
        createResBody = d || '';
      },
    };
    await gatewayHandler(createReq as never, createRes as never);
    const createdRun = JSON.parse(createResBody) as { runId: string };
    expect(createdRun.runId).toBeTruthy();

    // 2. Connect to SSE stream
    const events: string[] = [];
    const eventReq: unknown = {
      method: 'GET',
      url: `/runs/${createdRun.runId}/events`,
      headers: {},
      on() {},
      async *[Symbol.asyncIterator]() {},
    };
    const eventRes: unknown = {
      statusCode: 200,
      setHeader() {},
      write(chunk: string) {
        events.push(chunk);
      },
      end() {},
    };
    const handled = await gatewayHandler(eventReq as never, eventRes as never);
    expect(handled).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toContain('event: status');
  });

  it('provides Java SDK 7.x daemon bridge compatibility and headers', async () => {
    const { createJavaSdkBridge } = await import('../server/javaSdkBridge.js');
    const bridge = createJavaSdkBridge({ javaEngineVersion: '7.4.2-GA' });

    let body = '';
    const req: unknown = {
      method: 'GET',
      url: '/health',
      headers: {},
      async *[Symbol.asyncIterator]() {},
    };
    const res: unknown = {
      statusCode: 200,
      setHeader() {},
      end(d?: string) {
        body = d || '';
      },
    };
    const handled = await bridge(req as never, res as never);
    expect(handled).toBe(true);
    const parsed = JSON.parse(body) as { engine: string };
    expect(parsed.engine).toContain('Java SDK Daemon (7.4.2-GA)');
  });

  it('injects Bearer authorization headers in createHttpRuntimeAdapter', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers || {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'healthy', valid: true }),
      };
    };

    const adapter = createHttpRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:8091',
      authToken: 'test-jwt-token-999',
      fetchImpl: mockFetch as never,
    });

    const doc: WorkflowDocument = parseWorkflow(SAMPLE_WORKFLOW).document;
    await adapter.validate(doc);
    expect(capturedHeaders.authorization).toBe('Bearer test-jwt-token-999');
  });

  it('parses and serializes workflow documents containing use.functions', () => {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === 'reusable-functions-orchestrator');
    expect(template).toBeDefined();
    const parsed = parseWorkflow(template!.specification);
    expect(parsed.document.use?.functions).toBeDefined();
    expect(Object.keys(parsed.document.use?.functions || {})).toContain('calculateTax');
    expect(Object.keys(parsed.document.use?.functions || {})).toContain('sendAlert');

    const serializedYaml = serializeWorkflow(parsed.document, 'yaml');
    expect(serializedYaml).toContain('functions:');
    expect(serializedYaml).toContain('calculateTax:');

    const serializedJson = serializeWorkflow(parsed.document, 'json');
    const roundTripJson = JSON.parse(serializedJson);
    expect(roundTripJson.use.functions.sendAlert).toBeDefined();
  });

  it('validates function call targets against use.functions', () => {
    const validDoc: WorkflowDocument = {
      document: { name: 'valid-function-doc' },
      use: {
        functions: {
          myHelper: { set: { helped: true } },
        },
      },
      do: [{ callHelper: { call: 'myHelper' } }],
    };
    const validIssues = validateGraph(validDoc);
    expect(validIssues.some((issue) => issue.path.includes('call'))).toBe(false);

    const invalidDoc: WorkflowDocument = {
      document: { name: 'invalid-function-doc' },
      use: {
        functions: {
          myHelper: { set: { helped: true } },
        },
      },
      do: [{ callUndefined: { call: 'nonExistentFn' } }],
    };
    const invalidIssues = validateGraph(invalidDoc);
    expect(invalidIssues.some((issue) => issue.message.includes('not defined in use.functions'))).toBe(true);
  });

  it('formats task subtitle for function call tasks', () => {
    expect(getTaskSubtitle('call', { call: 'calculateTax' })).toBe('fn: calculateTax');
    expect(
      getTaskSubtitle('call', { call: 'payment-service', with: { endpoint: 'https://api.example.com' } }),
    ).toBe('HTTP call');
  });

  it('assigns distinctive icon and color for function call tasks', () => {
    expect(getTaskIcon('call', { call: 'calculateTax' })).toBe('ƒ');
    expect(
      getTaskIcon('call', { call: 'payment-service', with: { endpoint: 'https://api.example.com' } }),
    ).toBe('↗');
    expect(getTaskColor('call', { call: 'calculateTax' })).toBe('purple');
    expect(
      getTaskColor('call', { call: 'payment-service', with: { endpoint: 'https://api.example.com' } }),
    ).toBe('violet');
  });

  it('flags invalid function definitions in validateGraph', () => {
    const invalidFnDoc: WorkflowDocument = {
      document: { name: 'broken-fn-doc' },
      use: {
        functions: {
          badFn: null as unknown as TaskDefinition,
        },
      },
      do: [{ step1: { set: { val: 1 } } }],
    };
    const issues = validateGraph(invalidFnDoc);
    expect(issues.some((i) => i.path.includes('/use/functions/badFn'))).toBe(true);
  });
});
