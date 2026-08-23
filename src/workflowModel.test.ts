import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as yaml from 'js-yaml';
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
import { createAiProviderBridge } from '../server/aiProviderBridge';
import {
  buildLibraryRows,
  createWorkflowRecord,
  createWorkflowPersistence,
  assertWorkflowPersistence,
  parseWorkflowLibrary,
  removeWorkflowRecord,
  reorderWorkflowIds,
  serializeWorkflowLibrary,
  uniqueWorkflowName,
  upsertWorkflowRecord,
  replaceWorkflowRecordsWithState,
  recordWorkflowRevision,
} from './workflowStore';
import {
  addTopLevelAiTask,
  addTopLevelTask,
  autoLayoutFlow,
  collectSubflowReferences,
  connectTopLevelTasks,
  createAiSubflowDocument,
  createFlowGraph,
  detectMissingSubflowReferences,
  duplicateTopLevelTask,
  disconnectTopLevelTasks,
  getBreadcrumbPath,
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
import { validateJavaScriptFunction } from './scriptContract';
import type { TaskDefinition, WorkflowDocument } from './types';

describe('reorderWorkflowIds', () => {
  it('moves the dragged id to the target position', () => {
    expect(reorderWorkflowIds(['a', 'b', 'c', 'd'], 'c', 'a')).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderWorkflowIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns the input unchanged when ids are missing or identical', () => {
    expect(reorderWorkflowIds(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(reorderWorkflowIds(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
    expect(reorderWorkflowIds(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
  });
});

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

    // The copy is appended at the end of the do list (keeps it visible in the
    // semantic graph) with the outgoing edge removed.
    expect(duplicate.do?.[(duplicate.do?.length ?? 1) - 1]?.['checkTravelPassExpiry-copy']).toEqual({
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
    expect(bundle.subflows).toEqual([]);
    expect(bundle.unresolvedSubflowTargets).toEqual([]);
    expect(bundle.dockerfile).toContain('COPY workflow.yaml /app/workflow.yaml');
    expect(bundle.dockerfile).not.toContain('COPY subflows/');
    expect(bundle.kubernetesYaml).not.toContain('WORKFLOW_SUBFLOW_PATH');
  });

  it('ships referenced AI sub-flows in the deployment bundle', async () => {
    const { generateDeploymentBundle } = await import('./deploymentBundle');
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === 'ai-orchestration');
    expect(template).toBeDefined();
    const bundle = generateDeploymentBundle(template!.specification, 'ai-orchestration');

    expect(bundle.subflows.map((artifact) => `${artifact.namespace}/${artifact.name}`).sort()).toEqual([
      'ai/ai-agent',
      'ai/prompt-llm',
    ]);
    expect(bundle.subflows.every((artifact) => artifact.source === 'ai-contract')).toBe(true);
    expect(bundle.unresolvedSubflowTargets).toEqual([]);
    expect(bundle.dockerfile).toContain('COPY subflows/ /app/subflows/');
    expect(bundle.dockerfile).toContain('ENV WORKFLOW_SUBFLOW_PATH=/app/subflows');
    expect(bundle.dockerfile).not.toContain('COPY ai/');
    // ConfigMap data keys are k8s-charset-safe (dot layout, Task 58);
    // shipped file paths/mounts stay slash-layout. Safe segments pass through
    // unchanged, so the two only differ in separator here.
    expect(bundle.kubernetesYaml).toContain('subflows.ai.prompt-llm.yaml: |');
    expect(bundle.kubernetesYaml).toContain('subflows.ai.ai-agent.yaml: |');
    expect(bundle.kubernetesYaml).toContain('mountPath: /app/subflows/ai/prompt-llm.yaml');
    expect(bundle.kubernetesYaml).toContain('subPath: subflows/ai/ai-agent.yaml');
    expect(bundle.kubernetesYaml).toContain('WORKFLOW_SUBFLOW_PATH');
    expect(bundle.kubernetesYaml).toMatch(
      /- key: subflows\.ai\.prompt-llm\.yaml\s*\n\s*path: subflows\/ai\/prompt-llm\.yaml/,
    );
    expect(bundle.readmeMd).toContain('subflows/ai/prompt-llm.yaml');
    expect(bundle.readmeMd).toContain('WORKFLOW_SUBFLOW_PATH=/app/subflows');
    // The bundled sub-flow YAMLs are schema-valid and catalog-backed.
    const llm = bundle.subflows.find((artifact) => artifact.name === 'prompt-llm');
    expect(parseWorkflow(llm!.yaml).document.document?.name).toBe('prompt-llm');
    expect(llm!.yaml).toContain('ai-providers');
    const agent = bundle.subflows.find((artifact) => artifact.name === 'ai-agent');
    expect(agent!.yaml).toContain('agents');
  });

  it('ships user sub-flow documents and reports unresolved references', async () => {
    const { generateDeploymentBundle, findSubflowDelegations } = await import('./deploymentBundle');
    const parent = `document:
  dsl: "1.0.3"
  namespace: default
  name: parent-flow
  version: "0.1.0"
do:
  - callBilling:
      run:
        workflow:
          namespace: billing
          name: billing-process
          version: "0.1.0"
  - callLlm:
      run:
        workflow:
          namespace: ai
          name: prompt-llm
          version: "0.1.0"
  - callMissing:
      run:
        workflow:
          namespace: payments
          name: charge-card
          version: "0.1.0"`;
    const billingDoc = {
      document: { dsl: '1.0.3', namespace: 'billing', name: 'billing-process', version: '0.1.0' },
      do: [{ chargeCustomer: { set: { customerCharged: true } } }],
    };

    const collection = findSubflowDelegations(parent, [billingDoc]);
    expect(collection.artifacts.map((a) => `${a.namespace}/${a.name}`).sort()).toEqual([
      'ai/prompt-llm',
      'billing/billing-process',
    ]);
    const billing = collection.artifacts.find((a) => a.name === 'billing-process')!;
    expect(billing.source).toBe('document');
    expect(billing.yaml).toContain('customerCharged: true');
    const llm = collection.artifacts.find((a) => a.name === 'prompt-llm')!;
    expect(llm.source).toBe('ai-contract');
    expect(collection.unresolved.map((t) => `${t.namespace}/${t.name}`)).toEqual(['payments/charge-card']);

    const bundle = generateDeploymentBundle(parent, 'parent-flow', [billingDoc]);
    expect(bundle.dockerfile).toContain('COPY subflows/ /app/subflows/');
    // ConfigMap data key uses the k8s-safe dot layout (Task 58).
    expect(bundle.kubernetesYaml).toContain('subflows.billing.billing-process.yaml: |');
    expect(bundle.kubernetesYaml).toContain('mountPath: /app/subflows/billing/billing-process.yaml');
    expect(bundle.readmeMd).toContain('`payments/charge-card` have no document in the workspace');
  });

  it('a workspace document wins over the canonical AI contract', async () => {
    const { findSubflowDelegations } = await import('./deploymentBundle');
    const parent = `document:
  dsl: "1.0.3"
  namespace: default
  name: custom-ai
  version: "0.1.0"
do:
  - callLlm:
      run:
        workflow:
          namespace: ai
          name: prompt-llm
          version: "0.1.0"`;
    const editedLlm = {
      document: { dsl: '1.0.3', namespace: 'ai', name: 'prompt-llm', version: '0.1.0' },
      do: [{ switchToCompanyModel: { set: { model: 'company-gpt' } } }],
    };
    const collection = findSubflowDelegations(parent, [editedLlm]);
    expect(collection.artifacts).toHaveLength(1);
    const llm = collection.artifacts[0];
    expect(llm.source).toBe('document');
    expect(llm.yaml).toContain('company-gpt');
    expect(llm.yaml).not.toContain('ai-providers');
  });

  it('finds AI delegations inside nested containers and dedupes by name', async () => {
    const { findSubflowDelegations } = await import('./deploymentBundle');
    const nested = `document:
  dsl: "1.0.3"
  namespace: default
  name: nested-ai
  version: "0.1.0"
do:
  - topDelegation:
      run:
        workflow:
          namespace: ai
          name: prompt-llm
          version: "0.1.0"
  - processBatch:
      for:
        each: item
        in: "\${ $input.items }"
      do:
        - innerDelegation:
            run:
              workflow:
                namespace: ai
                name: prompt-llm
                version: "0.1.0"
        - agentCall:
            run:
              workflow:
                namespace: ai
                name: ai-agent
                version: "0.1.0"
        - retryCall:
            try:
              - guarded:
                  run:
                    workflow:
                      namespace: ai
                      name: ai-agent
                      version: "0.1.0"
            catch:
              do:
                - catchCall:
                    run:
                      workflow:
                        namespace: ai
                        name: ai-agent
                        version: "0.1.0"
  - externalCall:
      run:
        workflow:
          namespace: billing
          name: billing-process
          version: "0.1.0"`;
    const { artifacts, unresolved } = findSubflowDelegations(nested);
    expect(artifacts.map((artifact) => artifact.name).sort()).toEqual(['ai-agent', 'prompt-llm']);
    expect(artifacts).toHaveLength(2);
    expect(unresolved.map((target) => `${target.namespace}/${target.name}`)).toEqual([
      'billing/billing-process',
    ]);
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

describe('getBreadcrumbPath', () => {
  const nestedDoc: WorkflowDocument = {
    document: { name: 'nested' },
    do: [
      { prepare: { set: { ok: true }, then: 'fanout' } },
      {
        fanout: {
          fork: {
            compete: false,
            branches: [{ sendEmail: { call: 'email-service' } }, { sendSms: { call: 'sms-service' } }],
          },
          then: 'loop',
        },
      },
      {
        loop: {
          for: { each: 'record', in: '${ $context.records }', at: 'index' },
          do: [
            {
              guarded: {
                try: [{ risky: { call: 'svc' } }],
                catch: { do: [{ fallback: { set: { recovered: true } } }] },
              },
            },
          ],
        },
      },
    ],
  };

  it('returns an empty path for null or non-task ids', () => {
    expect(getBreadcrumbPath(nestedDoc, null)).toEqual([]);
    expect(getBreadcrumbPath(nestedDoc, 'root-entry-node')).toEqual([]);
  });

  it('builds a top-level path of do / <name>', () => {
    expect(getBreadcrumbPath(nestedDoc, '/do/prepare')).toEqual([
      { label: 'do', taskId: null },
      { label: 'prepare', taskId: '/do/prepare' },
    ]);
  });

  it('walks into fork branches', () => {
    expect(getBreadcrumbPath(nestedDoc, '/do/fanout/fork/branches/sendSms')).toEqual([
      { label: 'do', taskId: null },
      { label: 'fanout', taskId: '/do/fanout' },
      { label: 'fork', taskId: null },
      { label: 'branches', taskId: null },
      { label: 'sendSms', taskId: '/do/fanout/fork/branches/sendSms' },
    ]);
  });

  it('walks through for.do and try/catch nesting', () => {
    expect(getBreadcrumbPath(nestedDoc, '/do/loop/do/guarded/try/risky')).toEqual([
      { label: 'do', taskId: null },
      { label: 'loop', taskId: '/do/loop' },
      { label: 'do', taskId: null },
      { label: 'guarded', taskId: '/do/loop/do/guarded' },
      { label: 'try', taskId: null },
      { label: 'risky', taskId: '/do/loop/do/guarded/try/risky' },
    ]);
    expect(getBreadcrumbPath(nestedDoc, '/do/loop/do/guarded/catch/do/fallback')).toEqual([
      { label: 'do', taskId: null },
      { label: 'loop', taskId: '/do/loop' },
      { label: 'do', taskId: null },
      { label: 'guarded', taskId: '/do/loop/do/guarded' },
      { label: 'catch', taskId: null },
      { label: 'do', taskId: null },
      { label: 'fallback', taskId: '/do/loop/do/guarded/catch/do/fallback' },
    ]);
  });
});

describe('canvas graph completeness & duplication (Task 27 fix)', () => {
  it('duplicateTopLevelTask appends the copy at the end of the do list', () => {
    const { document } = parseWorkflow(SAMPLE_WORKFLOW);
    const next = duplicateTopLevelTask(document, '/do/checkTravelPassExpiry');
    const names = (next.do ?? []).map((item) => Object.keys(item)[0]);
    expect(names.at(-1)).toBe('checkTravelPassExpiry-copy');
    expect(names).toHaveLength((document.do ?? []).length + 1);
  });

  it('the duplicated task appears in the canvas flow graph', () => {
    const { document } = parseWorkflow(SAMPLE_WORKFLOW);
    let next = duplicateTopLevelTask(document, '/do/verifyNolAccount');
    next = duplicateTopLevelTask(next, '/do/checkTravelPassExpiry');
    const flow = createFlowGraph(next);
    const ids = flow.nodes.map((node) => node.id);
    expect(ids).toContain('/do/verifyNolAccount-copy');
    expect(ids).toContain('/do/checkTravelPassExpiry-copy');
    expect(flow.nodes.filter((node) => node.type === 'task')).toHaveLength(10);
  });

  it('createFlowGraph keeps disconnected top-level tasks that the SDK semantic graph omits', () => {
    const { document } = parseWorkflow(`document:
  dsl: "1.0.3"
  namespace: default
  name: disconnected
  version: "0.1.0"
do:
  - firstTask:
      set:
        ok: true
  - secondTask:
      set:
        ok: true
      then: thirdTask
  - thirdTask:
      set:
        ok: true`);
    // Both entries are present regardless of SDK traversal quirks.
    const flow = createFlowGraph(document);
    const ids = flow.nodes.map((node) => node.id);
    expect(ids).toContain('/do/firstTask');
    expect(ids).toContain('/do/secondTask');
    expect(ids).toContain('/do/thirdTask');
  });
});

describe('AI task families (Task 16)', () => {
  it('builds a schema-valid LLM sub-flow document (catalog + script stub)', () => {
    const doc = createAiSubflowDocument('llm-call');
    const parsed = parseWorkflow(serializeWorkflow(doc, 'yaml'));
    expect(parsed.document.document?.name).toBe('prompt-llm');
    expect(parsed.document.document?.namespace).toBe('ai');
    expect(
      (parsed.document.use?.catalogs?.['ai-providers'] as { endpoint?: string } | undefined)?.endpoint,
    ).toContain('api.example.ai');
    const invoke = parsed.document.do?.[0]?.invokeLlm;
    expect(invoke?.run?.script?.language).toBe('javascript');
    expect(validateJavaScriptFunction(invoke?.run?.script?.code)).toEqual({ valid: true });
  });

  it('builds a schema-valid agent sub-flow document', () => {
    const doc = createAiSubflowDocument('ai-agent-call');
    const parsed = parseWorkflow(serializeWorkflow(doc, 'yaml'));
    expect(parsed.document.document?.name).toBe('ai-agent');
    expect(
      (parsed.document.use?.catalogs?.['agents'] as { endpoint?: string } | undefined)?.endpoint,
    ).toContain('api.example.ai');
    const invoke = parsed.document.do?.[0]?.runAgent;
    expect(validateJavaScriptFunction(invoke?.run?.script?.code)).toEqual({ valid: true });
    expect(parsed.document.do?.[1]?.captureResult?.set?.agentResult).toContain('$context.runAgent.outcome');
  });

  it('adds a schema-valid AI delegation task (run.workflow to the ai namespace)', () => {
    const { document } = parseWorkflow(NEW_WORKFLOW);
    let next = addTopLevelAiTask(document, 'llm-call');
    next = addTopLevelAiTask(next, 'ai-agent-call');
    const parsed = parseWorkflow(serializeWorkflow(next, 'yaml'));
    const names = (parsed.document.do ?? []).map((item) => Object.keys(item)[0]);
    expect(names).toContain('aiLlmTask');
    expect(names).toContain('aiAgentTask');
    const llm = parsed.document.do?.find((item) => 'aiLlmTask' in item)?.['aiLlmTask'];
    expect(llm?.run?.workflow).toEqual({ namespace: 'ai', name: 'prompt-llm', version: '0.1.0' });
    // The delegation task shows in the canvas graph.
    const flow = createFlowGraph(parsed.document);
    expect(flow.nodes.map((node) => node.id)).toContain('/do/aiLlmTask');
    expect(flow.nodes.map((node) => node.id)).toContain('/do/aiAgentTask');
    // AI-delegated nodes render with the magenta AI styling contract.
    expect(getTaskColor('run', llm as never)).toBe('magenta');
    expect(getTaskSubtitle('run', llm as never)).toBe('ai: prompt-llm');
  });

  it('every catalogued workflow template parses as a valid document', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(() => parseWorkflow(template.specification), template.id).not.toThrow();
    }
  });
});

describe('gateway AI provider endpoints (Task 32)', () => {
  const fakeBridge = {
    chat: async (payload: { model?: string; messages?: unknown }) => ({
      completion: `hello ${payload.model || 'default'}`,
      usage: { inputTokens: 1, outputTokens: 3 },
    }),
    runAgent: async (payload: { goal?: string }) => ({
      steps: [{ tool: 'search', status: 'ok' }],
      outcome: `agent: ${payload.goal || ''}`,
    }),
  };

  const makeHandler = () => createRuntimeGatewayHandler({ createAiBridge: () => fakeBridge as never });

  async function post(
    handler: Awaited<ReturnType<typeof makeHandler>>,
    pathname: string,
    body: unknown,
    method = 'POST',
  ) {
    const chunks: string[] = body === undefined ? [] : [JSON.stringify(body)];
    let resStatus = 200;
    let resBody = '';
    const req: unknown = {
      method,
      url: pathname,
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const res: unknown = {
      statusCode: 200,
      setHeader() {
        /* noop */
      },
      end(data?: string) {
        resBody = data || '';
      },
    };
    await handler(req as never, res as never);
    resStatus = (res as { statusCode: number }).statusCode;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(resBody);
    } catch {
      parsed = resBody;
    }
    return { status: resStatus, body: parsed };
  }

  it('serves /ai/chat through the provider bridge', async () => {
    const handler = makeHandler();
    const result = await post(handler, '/ai/chat', {
      model: 'gpt-x',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.status).toBe(200);
    expect((result.body as { result: { completion: string } }).result.completion).toBe('hello gpt-x');
  });

  it('serves /ai/agent through the provider bridge', async () => {
    const handler = makeHandler();
    const result = await post(handler, '/ai/agent', { goal: 'book a table' });
    expect(result.status).toBe(200);
    expect((result.body as { result: { outcome: string } }).result.outcome).toBe('agent: book a table');
  });

  it('rejects invalid JSON payloads with 400', async () => {
    const handler = makeHandler();
    const chunks = ['not-json'];
    let resStatus = 500;
    let resBody = '';
    const req: unknown = {
      method: 'POST',
      url: '/ai/chat',
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const res: unknown = {
      statusCode: 500,
      setHeader() {
        /* noop */
      },
      end(data?: string) {
        resBody = data || '';
      },
    };
    await handler(req as never, res as never);
    resStatus = (res as { statusCode: number }).statusCode;
    expect(resStatus).toBe(400);
    expect(resBody).toContain('Invalid JSON');
  });

  it('returns 503 when the bridge is not configured', async () => {
    const handler = createRuntimeGatewayHandler({
      createAiBridge: () => ({ configurationError: new Error('no provider key') }) as never,
    });
    const result = await post(handler, '/ai/chat', { messages: [] });
    expect(result.status).toBe(503);
  });

  it('writes audit entries for AI calls', async () => {
    const handler = makeHandler();
    await post(handler, '/ai/chat', { messages: [{ role: 'user', content: 'hi' }] });
    const audit = (await post(handler, '/audit', undefined, 'GET')) as {
      body: { entries: Array<{ pathname: string; aiKind?: string }> };
    };
    const chatEntries = audit.body.entries.filter((entry) => entry.pathname === '/ai/chat');
    expect(chatEntries.length).toBeGreaterThan(0);
    expect(chatEntries[0].aiKind).toBe('chat');
  });
});

describe('gateway with the real provider bridge (Task 54)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function post(
    handler: ReturnType<typeof createRuntimeGatewayHandler>,
    pathname: string,
    body: unknown,
    method = 'POST',
  ) {
    const chunks: string[] = body === undefined ? [] : [JSON.stringify(body)];
    let resStatus = 200;
    let resBody = '';
    const req: unknown = {
      method,
      url: pathname,
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const res: unknown = {
      statusCode: 200,
      setHeader() {
        /* noop */
      },
      end(data?: string) {
        resBody = data || '';
      },
    };
    await handler(req as never, res as never);
    resStatus = (res as { statusCode: number }).statusCode;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(resBody);
    } catch {
      parsed = resBody;
    }
    return { status: resStatus, body: parsed };
  }

  it('routes /ai/chat through the real bridge to the provider', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hello from provider' } }], model: 'gpt-test' }),
      text: async () => '',
    });
    const handler = createRuntimeGatewayHandler({
      aiProviderConfig: { apiKey: 'sk-test', baseUrl: 'https://provider.test/v1' },
    });
    const result = await post(handler, '/ai/chat', {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.status).toBe(200);
    expect((result.body as { result: { completion: string } }).result.completion).toBe('hello from provider');
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://provider.test/v1/chat');
    expect(init.headers.authorization).toBe('Bearer sk-test');

    // The call is on the audit trail with the AI kind.
    const audit = (await post(handler, '/audit', undefined, 'GET')) as {
      body: { entries: Array<{ pathname: string; aiKind?: string }> };
    };
    const chatEntries = audit.body.entries.filter((entry) => entry.pathname === '/ai/chat');
    expect(chatEntries.length).toBeGreaterThan(0);
    expect(chatEntries[0].aiKind).toBe('chat');
  });

  it('reports provider failures as 502 through the real bridge', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({}),
      text: async () => 'quota exceeded',
    });
    const handler = createRuntimeGatewayHandler({
      aiProviderConfig: { apiKey: 'sk-test', baseUrl: 'https://provider.test/v1' },
    });
    const result = await post(handler, '/ai/chat', { messages: [{ role: 'user', content: 'hi' }] });
    expect(result.status).toBe(502);
    expect((result.body as { error?: string }).error || JSON.stringify(result.body)).toContain(
      'AI provider error (402)',
    );
  });

  it('returns 503 when the real bridge reports no key', async () => {
    const handler = createRuntimeGatewayHandler({});
    const result = await post(handler, '/ai/chat', { messages: [] });
    expect(result.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('demo engine AI delegation (Task 33)', () => {
  async function runToCompletion(
    runtime: ReturnType<typeof createDemoRuntimeAdapter>,
    workflow: WorkflowDocument,
  ) {
    const started = (await runtime.start(workflow, {
      prompt: 'Draft a summary',
      goal: 'Resolve the ticket',
      model: 'demo-model',
    })) as { runId: string };
    let status = (await runtime.status(started.runId)) as {
      status: string;
      output?: Record<string, unknown>;
      tasks: Array<{ id: string; name: string; type: string }>;
    };
    for (let attempt = 0; attempt < 30 && status.status === 'running'; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = (await runtime.status(started.runId)) as {
        status: string;
        output?: Record<string, unknown>;
        tasks: Array<{ id: string; name: string; type: string }>;
      };
    }
    return status;
  }

  it('executes an AI delegation task with the LLM sub-flow contract', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = addTopLevelAiTask(workflow, 'llm-call');
    workflow = {
      ...workflow,
      do: [...(workflow.do || []), { mapResult: { set: { summary: '${ $context.aiLlmTask.llmResult }' } } }],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    expect(status.tasks.map((task) => task.name)).toEqual(['aiLlmTask', 'mapResult']);
    const llmContext = status.output?.['aiLlmTask'] as { llmResult?: string; model?: string } | undefined;
    expect(llmContext?.llmResult).toContain('[mock-llm] Draft a summary');
    expect(llmContext?.model).toBe('demo-model');
    expect(status.output?.['summary']).toContain('[mock-llm]');
  });

  it('executes an AI agent delegation task with the agent contract', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0 });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = addTopLevelAiTask(workflow, 'ai-agent-call');

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    const agentContext = status.output?.['aiAgentTask'] as
      { agentResult?: string; steps?: unknown[] } | undefined;
    expect(agentContext?.agentResult).toContain('[mock-agent] Resolve the ticket');
    expect(agentContext?.steps).toHaveLength(2);
  });

  it('runs the ai-orchestration template end-to-end with mocked delegations', async () => {
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === 'ai-orchestration');
    expect(template).toBeDefined();
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      executeScript: async () => ({ completion: 'done' }),
    });
    const status = await runToCompletion(runtime, parseWorkflow(template!.specification).document);
    expect(status.status).toBe('completed');
    expect(status.tasks.map((task) => task.name)).toEqual(
      expect.arrayContaining(['captureRequest', 'delegateLlm', 'delegateAgent', 'mapOutcome', 'emitReady']),
    );
    expect(status.output?.['llmSummary']).toContain('[mock-llm]');
    expect(status.output?.['agentOutcome']).toContain('[mock-agent]');
  });

  it('runs the ai-orchestration template end-to-end executing the AI sub-flow documents', async () => {
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === 'ai-orchestration');
    expect(template).toBeDefined();
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      executeScript: async () => ({
        completion: '[scripted] template llm',
        outcome: '[scripted] template agent',
        model: 'company-gpt',
      }),
      subflowDocuments: [createAiSubflowDocument('llm-call'), createAiSubflowDocument('ai-agent-call')],
    });
    const status = await runToCompletion(runtime, parseWorkflow(template!.specification).document);
    expect(status.status).toBe('completed');
    expect(status.tasks.map((task) => task.id)).toContainEqual(
      'delegateLlm/subflow/prompt-llm/captureResult',
    );
    expect(status.tasks.map((task) => task.id)).toContainEqual(
      'delegateAgent/subflow/ai-agent/captureResult',
    );
    expect(status.output?.['llmSummary']).toBe('[scripted] template llm');
    expect(status.output?.['agentOutcome']).toBe('[scripted] template agent');
  });
});

describe('demo engine sub-flow document execution (Task 38)', () => {
  async function runToCompletion(
    runtime: ReturnType<typeof createDemoRuntimeAdapter>,
    workflow: WorkflowDocument,
  ) {
    const started = (await runtime.start(workflow, {
      prompt: 'Draft a summary',
      goal: 'Resolve the ticket',
      model: 'demo-model',
    })) as { runId: string };
    let status = (await runtime.status(started.runId)) as {
      status: string;
      output?: Record<string, unknown>;
      tasks: Array<{ id: string; name: string; type: string }>;
      failures: Array<{ message: string }>;
      logs: string[];
    };
    for (
      let attempt = 0;
      attempt < 60 && status.status === 'running' && !status.failures.length;
      attempt += 1
    ) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = (await runtime.status(started.runId)) as typeof status;
    }
    return status;
  }

  const billingDocument: WorkflowDocument = {
    document: { dsl: '1.0.3', namespace: 'dubai-government', name: 'billing-process', version: '0.1.0' },
    do: [{ initSubflow: { set: { subflowReady: true } } }],
  };

  it('executes a referenced user sub-flow document from the workspace', async () => {
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      subflowDocuments: () => [billingDocument],
    });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        ...(workflow.do || []),
        {
          callBilling: {
            run: {
              workflow: {
                namespace: 'dubai-government',
                name: 'billing-process',
                version: '0.1.0',
              },
            },
          },
        },
        { mapOutcome: { set: { ready: '${ $context.callBilling.subflowReady }' } } },
      ],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    const billing = status.output?.['callBilling'] as
      { subflowReady?: boolean; executed?: boolean } | undefined;
    expect(billing?.executed).toBe(true);
    expect(billing?.subflowReady).toBe(true);
    expect(status.output?.['ready']).toBe(true);
    expect(status.tasks.map((task) => task.id)).toContainEqual(
      'callBilling/subflow/billing-process/initSubflow',
    );
    expect(status.logs.join('\n')).toContain('Executing sub-flow dubai-government/billing-process');
  });

  it('executes a provided AI-namespace document instead of the mock contract', async () => {
    const customLlm: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'ai', name: 'prompt-llm', version: '0.1.0' },
      do: [{ companyModel: { set: { llmResult: '${ $input.prompt }', model: 'company-gpt' } } }],
    };
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0, subflowDocuments: [customLlm] });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = addTopLevelAiTask(workflow, 'llm-call');
    workflow = {
      ...workflow,
      do: [...(workflow.do || []), { mapResult: { set: { summary: '${ $context.aiLlmTask.llmResult }' } } }],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    const llm = status.output?.['aiLlmTask'] as
      { llmResult?: string; model?: string; executed?: boolean } | undefined;
    expect(llm?.executed).toBe(true);
    expect(llm?.llmResult).toBe('Draft a summary');
    expect(llm?.model).toBe('company-gpt');
    expect(status.output?.['summary']).toBe('Draft a summary');
    expect(status.tasks.map((task) => task.id)).toContainEqual('aiLlmTask/subflow/prompt-llm/companyModel');
  });

  it('guards against runaway sub-flow recursion with a depth limit', async () => {
    const selfLoop: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'loop', name: 'recursive', version: '0.1.0' },
      do: [{ again: { run: { workflow: { namespace: 'loop', name: 'recursive', version: '0.1.0' } } } }],
    };
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0, subflowDocuments: [selfLoop] });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        {
          kickOff: {
            run: { workflow: { namespace: 'loop', name: 'recursive', version: '0.1.0' } },
          },
        },
      ],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('failed');
    const first = status.failures[0]?.message || '';
    expect(first).toContain('stopped sub-flow nesting at depth');
    expect(status.logs.join('\n')).toContain('Failed local demo run');
  });

  it('keeps the reference mock behavior when no matching document exists', async () => {
    const runtime = createDemoRuntimeAdapter({ stepDelay: 0, subflowDocuments: [billingDocument] });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = addTopLevelAiTask(workflow, 'llm-call');

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    const llm = status.output?.['aiLlmTask'] as { llmResult?: string; executed?: boolean } | undefined;
    expect(llm?.executed).toBeUndefined();
    expect(llm?.llmResult).toContain('[mock-llm] Draft a summary');
  });
});

describe('demo engine script parity — task outputs under task names (Task 40)', () => {
  async function runToCompletion(
    runtime: ReturnType<typeof createDemoRuntimeAdapter>,
    workflow: WorkflowDocument,
  ) {
    const started = (await runtime.start(workflow, {
      prompt: 'Draft a summary',
      goal: 'Resolve the ticket',
      model: 'demo-model',
    })) as { runId: string };
    let status = (await runtime.status(started.runId)) as {
      status: string;
      output?: Record<string, unknown>;
      tasks: Array<{ id: string; name: string; type: string }>;
      failures: Array<{ message: string }>;
      logs: string[];
    };
    for (
      let attempt = 0;
      attempt < 60 && status.status === 'running' && !status.failures.length;
      attempt += 1
    ) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      status = (await runtime.status(started.runId)) as typeof status;
    }
    return status;
  }

  it('stores sandbox script outputs under the task name', async () => {
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      executeScript: async () => ({ total: 42 }),
    });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = {
      ...workflow,
      do: [
        ...(workflow.do || []),
        {
          computeTotal: { run: { script: { language: 'javascript', code: '() => ({ total: 42 })' } } },
        },
        { useTotal: { set: { total: '${ $context.computeTotal.total }' } } },
      ],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    expect(status.output?.['total']).toBe(42);
  });

  it('executing the canonical AI sub-flow document yields its contract fields', async () => {
    const runtime = createDemoRuntimeAdapter({
      stepDelay: 0,
      executeScript: async () => ({
        completion: '[scripted] hello from the sandbox',
        model: 'company-gpt',
        usage: { inputTokens: 4, outputTokens: 2 },
      }),
      subflowDocuments: [createAiSubflowDocument('llm-call')],
    });
    let workflow = parseWorkflow(NEW_WORKFLOW).document;
    workflow = addTopLevelAiTask(workflow, 'llm-call');
    workflow = {
      ...workflow,
      do: [...(workflow.do || []), { mapResult: { set: { summary: '${ $context.aiLlmTask.llmResult }' } } }],
    };

    const status = await runToCompletion(runtime, workflow);
    expect(status.status).toBe('completed');
    const llm = status.output?.['aiLlmTask'] as { llmResult?: string; executed?: boolean } | undefined;
    expect(llm?.executed).toBe(true);
    expect(llm?.llmResult).toBe('[scripted] hello from the sandbox');
    expect(status.output?.['summary']).toBe('[scripted] hello from the sandbox');
    expect(status.tasks.map((task) => task.id)).toContainEqual('aiLlmTask/subflow/prompt-llm/captureResult');
  });
});

describe('buildLibraryRows (Task 34 — duplicate sidebar row)', () => {
  const saved = createWorkflowRecord({
    id: 'wf-saved',
    document: { document: { name: 'Saved Flow' } },
    specification: '',
  });

  it('yields exactly one row when the active unsaved tab is stashed in tabDocuments', () => {
    const rows = buildLibraryRows(
      [],
      [{ id: 'wf-new', name: 'New Flow', dirty: true }],
      'wf-new',
      'New Flow',
      true,
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'wf-new',
      name: 'New Flow',
      isActive: true,
      isDirty: true,
      isSaved: false,
    });
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('skips stashed snapshots that belong to saved records (single row wins)', () => {
    const rows = buildLibraryRows(
      [saved],
      [{ id: 'wf-saved', name: 'Stale Stash', dirty: true }],
      'wf-saved',
      'Saved Flow',
      true,
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'wf-saved', name: 'Saved Flow', isDirty: true, isSaved: true });
  });

  it('keeps every stashed unsaved tab plus the active fallback as unique rows', () => {
    const rows = buildLibraryRows(
      [],
      [
        { id: 'tab-a', name: 'Alpha', dirty: false },
        { id: 'tab-b', name: 'Beta', dirty: true },
      ],
      'tab-c',
      'Gamma',
      true,
      [],
    );
    expect(rows.map((row) => row.id)).toEqual(['tab-a', 'tab-b', 'tab-c']);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('respects the persisted drag order and falls back to alphabetical for unknown ids', () => {
    const rows = buildLibraryRows(
      [
        saved,
        createWorkflowRecord({ id: 'wf-z', document: { document: { name: 'Zed' } }, specification: '' }),
      ],
      [],
      'wf-new',
      'New Flow',
      false,
      ['wf-z'],
    );
    expect(rows.map((row) => row.id)).toEqual(['wf-z', 'wf-new', 'wf-saved']);
    expect(rows[0]).toMatchObject({ id: 'wf-z', isSaved: true });
    expect(rows[1]).toMatchObject({ id: 'wf-new', isActive: true, isSaved: false });
    expect(rows[2]).toMatchObject({ id: 'wf-saved', isSaved: true });
  });
});

describe('sub-flow reference diagnostics (Task 39)', () => {
  const parentSpec = `document:
  dsl: "1.0.3"
  namespace: default
  name: orchestrator
  version: "0.1.0"
do:
  - callBilling:
      run:
        workflow:
          namespace: billing
          name: billing-process
          version: "0.1.0"
  - callLlm:
      run:
        workflow:
          namespace: ai
          name: prompt-llm
          version: "0.1.0"
`;
  const billingDocument: WorkflowDocument = {
    document: { dsl: '1.0.3', namespace: 'billing', name: 'billing-process', version: '0.1.0' },
    do: [{ initSubflow: { set: { subflowReady: true } } }],
  };

  it('flags user sub-flow targets without a workspace document', () => {
    const document = parseWorkflow(parentSpec).document;
    const issues = detectMissingSubflowReferences(document);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('/do/callBilling');
    expect(issues[0].message).toContain('billing/billing-process');
    expect(issues[0].subflowTarget).toEqual({ namespace: 'billing', name: 'billing-process' });
  });

  it('exempts provided documents and canonical AI contracts', () => {
    const document = parseWorkflow(parentSpec).document;
    const issues = detectMissingSubflowReferences(document, [billingDocument]);
    expect(issues).toEqual([]);
  });

  it('reports nested delegations under their top-level task path', () => {
    const nestedSpec = `document:
  dsl: "1.0.3"
  namespace: default
  name: nested
  version: "0.1.0"
do:
  - processBatch:
      do:
        - innerCall:
            run:
              workflow:
                namespace: billing
                name: billing-process
                version: "0.1.0"
`;
    const document = parseWorkflow(nestedSpec).document;
    const issues = detectMissingSubflowReferences(document);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('/do/processBatch');
    const references = collectSubflowReferences(document);
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      namespace: 'billing',
      name: 'billing-process',
      topLevelName: 'processBatch',
    });
  });
});

describe('deployment bundle structural validity (Task 41)', () => {
  const parentSpec = `document:
  dsl: "1.0.3"
  namespace: default
  name: validated
  version: "0.1.0"
do:
  - callBilling:
      run:
        workflow:
          namespace: billing
          name: billing-process
          version: "0.1.0"
  - callLlm:
      run:
        workflow:
          namespace: ai
          name: prompt-llm
          version: "0.1.0"
`;
  const billingDocument: WorkflowDocument = {
    document: { dsl: '1.0.3', namespace: 'billing', name: 'billing-process', version: '0.1.0' },
    do: [{ initSubflow: { set: { subflowReady: true } } }],
  };

  const parseManifests = (yamlText: string) =>
    yaml.loadAll(yamlText) as Array<Record<string, unknown> & { kind?: string }>;

  it('keeps ConfigMap keys, volume items and subPath mounts consistent', async () => {
    const { generateDeploymentBundle } = await import('./deploymentBundle');
    const bundle = generateDeploymentBundle(parentSpec, 'validated', [billingDocument]);
    const manifests = parseManifests(bundle.kubernetesYaml);
    expect(manifests).toHaveLength(3);
    expect(manifests.map((manifest) => manifest.kind)).toEqual(['ConfigMap', 'Deployment', 'Service']);

    // Task 58: ConfigMap `data`/`items[].key` must be k8s-charset-safe
    // (dot layout via `subflowKey`); shipped file paths (`items[].path`,
    // `subPath`) stay slash-layout. `workflow.yaml` is identical in both.
    const { subflowKey } = await import('./deploymentBundle');
    const expectedKeys = ['workflow.yaml', ...bundle.subflows.map((artifact) => subflowKey(artifact))];
    const expectedPaths = [
      'workflow.yaml',
      ...bundle.subflows.map((artifact) => `subflows/${artifact.namespace}/${artifact.name}.yaml`),
    ];
    expect(expectedKeys.every((key) => /^[-._a-zA-Z0-9]+$/.test(key))).toBe(true);
    const configMap = manifests[0];
    const dataKeys = Object.keys((configMap.data as Record<string, unknown>) || {});
    expect(dataKeys.sort()).toEqual([...expectedKeys].sort());

    const deployment = manifests[1] as {
      spec: {
        template: {
          spec: {
            containers: Array<{
              env: unknown[];
              volumeMounts: Array<{ subPath: string; mountPath: string }>;
            }>;
            volumes: Array<{ configMap: { items: Array<{ key: string; path: string }> } }>;
          };
        };
      };
    };
    const container = deployment.spec.template.spec.containers[0];
    const subPaths = container.volumeMounts.map((mount) => mount.subPath);
    expect(subPaths.sort()).toEqual([...expectedPaths].sort());
    bundle.subflows.forEach((artifact) => {
      expect(
        container.volumeMounts.some(
          (mount) =>
            mount.subPath === `subflows/${artifact.namespace}/${artifact.name}.yaml` &&
            mount.mountPath === `/app/subflows/${artifact.namespace}/${artifact.name}.yaml`,
        ),
      ).toBe(true);
    });
    const items = deployment.spec.template.spec.volumes[0].configMap.items;
    expect(items.map((item) => item.key).sort()).toEqual([...expectedKeys].sort());
    // Keys (dot layout) and paths (slash layout) pair up 1:1 in order.
    expect(
      items.every(
        (item) =>
          item.path ===
          (item.key === 'workflow.yaml' ? 'workflow.yaml' : expectedPaths[expectedKeys.indexOf(item.key)]),
      ),
    ).toBe(true);
    expect(container.env).toContainEqual({ name: 'WORKFLOW_SUBFLOW_PATH', value: '/app/subflows' });
  });

  it('ships schema-valid sub-flow documents for both artifact sources', async () => {
    const { generateDeploymentBundle } = await import('./deploymentBundle');
    const bundle = generateDeploymentBundle(parentSpec, 'validated', [billingDocument]);
    expect(bundle.subflows.map((artifact) => artifact.source).sort()).toEqual(['ai-contract', 'document']);
    for (const artifact of bundle.subflows) {
      const parsed = parseWorkflow(artifact.yaml);
      expect(parsed.document.document?.namespace).toBe(artifact.namespace);
      expect(parsed.document.document?.name).toBe(artifact.name);
    }
  });

  it('emits the sub-flow copy line and env only when artifacts exist', async () => {
    const { generateDeploymentBundle } = await import('./deploymentBundle');
    const withArtifacts = generateDeploymentBundle(parentSpec, 'validated', [billingDocument]);
    expect(withArtifacts.dockerfile).toContain('COPY subflows/ /app/subflows/');
    const plain = generateDeploymentBundle(SAMPLE_WORKFLOW, 'plain');
    expect(plain.dockerfile).not.toContain('COPY subflows/');
    const plainManifests = parseManifests(plain.kubernetesYaml);
    const plainDeployment = plainManifests[1] as {
      spec: { template: { spec: { containers: Array<{ env: Array<{ name: string }> }> } } };
    };
    expect(plainDeployment.spec.template.spec.containers[0].env.map((entry) => entry.name)).not.toContain(
      'WORKFLOW_SUBFLOW_PATH',
    );
  });
});

describe('AI provider bridge (Task 53)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  type BridgeUnderTest = ReturnType<typeof createAiProviderBridge> & {
    chat: (payload: Record<string, unknown>) => Promise<{
      completion: string;
      model: string;
      usage: unknown;
    }>;
    runAgent: (payload: Record<string, unknown>) => Promise<{ steps: unknown[]; outcome: string }>;
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockProviderResponse = (body: unknown, ok = true, status = 200) => {
    fetchMock.mockResolvedValue({
      ok,
      status,
      json: async () => body,
      text: async () => (ok ? '' : 'upstream exploded'),
    });
  };

  it('reports a configuration error without a provider key', () => {
    const bridge = createAiProviderBridge({ requireKey: true });
    const candidate = bridge as unknown as { configurationError?: Error };
    expect(candidate.configurationError).toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the provider with Bearer auth and maps chat completions', async () => {
    mockProviderResponse({
      choices: [{ message: { content: 'Hello there' } }],
      model: 'gpt-test',
      usage: { total_tokens: 42 },
    });
    const bridge = createAiProviderBridge({
      apiKey: 'sk-test',
      baseUrl: 'https://provider.test/v1/',
    }) as BridgeUnderTest;
    const result = await bridge.chat({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
    });
    expect(result.completion).toBe('Hello there');
    expect(result.model).toBe('gpt-test');
    expect(result.usage).toEqual({ total_tokens: 42 });
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://provider.test/v1/chat');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('validates chat payloads: required, unknown and size limits', async () => {
    const bridge = createAiProviderBridge({ apiKey: 'sk-test' }) as BridgeUnderTest;
    await expect(bridge.chat({})).rejects.toThrow('Missing required field: messages');
    await expect(bridge.chat({ messages: [], nope: 1 })).rejects.toThrow('Unexpected field: nope');
    const oversize = { messages: [{ role: 'user', content: 'hi' }], maxTokens: 'z'.repeat(70 * 1024) };
    await expect(bridge.chat(oversize)).rejects.toThrow('Request too large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps provider failures into errors with the status', async () => {
    mockProviderResponse({}, false, 502);
    const bridge = createAiProviderBridge({ apiKey: 'sk-test' }) as BridgeUnderTest;
    await expect(bridge.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'AI provider error (502)',
    );
  });

  it('runs agents under the goal contract', async () => {
    mockProviderResponse({ steps: [{ tool: 'search', status: 'ok' }], outcome: 'found it' });
    const bridge = createAiProviderBridge({ apiKey: 'sk-test' }) as BridgeUnderTest;
    const result = await bridge.runAgent({
      agent: 'support-bot',
      goal: 'Answer the ticket',
      tools: ['search'],
      context: {},
      maxSteps: 5,
    });
    expect(result.steps).toEqual([{ tool: 'search', status: 'ok' }]);
    expect(result.outcome).toBe('found it');
    await expect(bridge.runAgent({ agent: 'support-bot' })).rejects.toThrow('Missing required field: goal');
  });
});
