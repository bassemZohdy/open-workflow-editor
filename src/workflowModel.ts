import { buildFlatGraph, validate, GraphNodeType } from '@openworkflowspec/sdk';
import * as yaml from 'js-yaml';
import { DEFAULT_JAVASCRIPT_TASK, type AiTaskKind } from './scriptContract';
import { findAiComponentBySubflow, getAiComponent } from './ai/registry';
import type {
  CanvasPosition,
  CanvasPositions,
  FlowEdge,
  FlowGraph,
  FlowNode,
  GraphIssue,
  ParsedWorkflow,
  TaskDefinition,
  TaskItem,
  WorkflowDocument,
  WorkflowFormat,
} from './types';

/** The SDK's workflow AST type, derived from buildFlatGraph's signature. */
type SdkWorkflow = Parameters<typeof buildFlatGraph>[0];

/** The catalog key the LLM sub-flow resolves its provider endpoint from. */
export const AI_PROVIDER_CATALOG = 'ai-providers';
export const AI_AGENT_CATALOG = 'agents';

/**
 * Builds a schema-valid AI component sub-flow document from its registry
 * entry: `use.catalogs` provider descriptor + a runnable contract task
 * (`run.script`) → capture mapping (`set`).
 */
export function createAiSubflowDocument(kind: AiTaskKind): WorkflowDocument {
  const component = getAiComponent(kind);
  return {
    document: {
      dsl: '1.0.3',
      namespace: component.subflowNamespace,
      name: component.subflowName,
      version: component.subflowVersion,
      metadata: { category: 'ai', kind },
    },
    use: {
      catalogs: {
        [component.catalog.catalogKey]: { endpoint: component.catalog.endpoint },
      },
    },
    do: [
      {
        [component.invokeName]: {
          run: {
            script: {
              language: 'javascript',
              code: component.script,
            },
          },
          then: 'captureResult',
        },
      },
      {
        captureResult: {
          set: {
            [component.resultKey]: `\${ $context.${component.invokeName}.${component.resultPath} }`,
          },
        },
      },
    ],
  };
}

/** Adds an AI delegation task (`run.workflow` → AI sub-flow) at the end of `do`. */
export function addTopLevelAiTask(document: WorkflowDocument, kind: AiTaskKind): WorkflowDocument {
  const component = getAiComponent(kind);
  const next = clone(document);
  const nextDo: TaskItem[] = next.do ?? [];
  let taskName = component.taskName;
  let suffix = 2;
  while (nextDo.some((item) => Object.hasOwn(item, taskName))) taskName = `${component.taskName}-${suffix++}`;
  nextDo.push({
    [taskName]: {
      run: {
        workflow: {
          namespace: component.subflowNamespace,
          name: component.subflowName,
          version: component.subflowVersion,
        },
      },
    },
  });
  next.do = nextDo;
  validate('Workflow', next);
  return next;
}

export interface SmartCityWorkflowExample {
  id: string;
  label: string;
  description: string;
  referenceLabel: string;
  referenceUrl: string;
  specification: string;
}

export const SAMPLE_WORKFLOW = `document:
  dsl: "1.0.3"
  namespace: dubai-government
  name: rta-nol-travel-pass-renewal
  version: "1.0.0"
  metadata:
    authority: rta
    service: nol-travel-pass
    scenario: scheduled-renewal
use:
  catalogs:
    dubai-services:
      endpoint: https://demo.dubai.ae/catalog
do:
  - checkTravelPassExpiry:
      set:
        renewalDue: true
        nolTagId: "0123456789"
        passDuration: 30-days
      then: verifyNolAccount
  - verifyNolAccount:
      call: rta-nol-account-service
      with:
        method: get
        endpoint: https://demo.rta.ae/v1/nol/accounts
        headers:
          x-authenticated-with: UAE-Pass
        query:
          nolTagId: "\${ $context.nolTagId }"
      then: calculateRenewalDecision
  - calculateRenewalDecision:
      run:
        script:
          language: javascript
          code: >-
            ({ input, context, catalogs }) => ({
              renewalEligible: context.renewalDue === true && Boolean(context.nolTagId),
              catalog: Object.keys(catalogs || {})[0] || 'none',
              requestedBy: input.channel || 'demo',
            })
      then: renewTravelPass
  - renewTravelPass:
      call: rta-nol-travel-pass-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/nol/travel-passes/renew
        headers:
          x-service-channel: nol-pay
        body:
          nolTagId: "\${ $context.nolTagId }"
          duration: "\${ $context.passDuration }"
      then: payTravelPassFees
  - payTravelPassFees:
      call: dubai-payment-service
      with:
        method: post
        endpoint: https://demo.dubai.ae/v1/payments/collect
        body:
          service: nol-travel-pass
          nolTagId: "\${ $context.nolTagId }"
      then: activateAtMetroGate
  - activateAtMetroGate:
      emit:
        event:
          with:
            source: https://demo.rta.ae/nol/travel-pass-renewed
            type: com.dubai.rta.nol.travel-pass.renewed
      then: notifyPassenger
  - notifyPassenger:
      emit:
        event:
          with:
            source: https://demo.rta.ae/nol/notifications
            type: com.dubai.rta.nol.travel-pass.ready
      then: recordRenewalOutcome
  - recordRenewalOutcome:
      set:
        renewalOutcomeRecorded: true

schedule:
  every: PT24H`;

export const SMART_CITY_WORKFLOWS: SmartCityWorkflowExample[] = [
  {
    id: 'rta-nol-travel-pass-renewal',
    label: 'RTA nol Travel Pass renewal',
    description:
      'Scheduled check → sandbox eligibility transform → renew pass → pay fees → activate at a Metro gate.',
    referenceLabel: 'RTA Manage nol Card / Travel Pass',
    referenceUrl: 'https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=648',
    specification: SAMPLE_WORKFLOW,
  },
  {
    id: 'rta-vehicle-ownership-renewal',
    label: 'RTA vehicle ownership renewal',
    description: 'Renewal event → verify insurance → technical inspection → issue ownership certificate.',
    referenceLabel: 'Dubai.ae Vehicle Registration',
    referenceUrl: 'https://www.dubai.ae/en/web/dubai.ae/living/driving-transportation/vehicle-registration',
    specification: `document:
  dsl: "1.0.3"
  namespace: dubai-government
  name: rta-vehicle-ownership-renewal
  version: "1.0.0"
  metadata:
    authority: rta
    service: vehicle-ownership-renewal
    scenario: event-driven-renewal
do:
  - listenForVehicleRenewalEvent:
      listen:
        to:
          one:
            with:
              source: https://demo.rta.ae/vehicle-events
              type: com.dubai.rta.vehicle.renewal.requested
        read: data
      then: prepareVehicleRenewal
  - prepareVehicleRenewal:
      set:
        renewalDue: true
        insuranceValid: true
        inspectionPassed: true
        vehiclePlate: DXB-A-1001
      then: verifyInsurance
  - verifyInsurance:
      call: rta-insurance-verification-service
      with:
        method: get
        endpoint: https://demo.rta.ae/v1/vehicles/insurance
        query:
          plate: "\${ $context.vehiclePlate }"
      then: inspectVehicle
  - inspectVehicle:
      call: rta-technical-inspection-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/vehicles/inspection
        body:
          plate: "\${ $context.vehiclePlate }"
      then: checkRenewalEligibility
  - checkRenewalEligibility:
      switch:
        - ready:
            when: "\${ $context.insuranceValid == true }"
            then: renewVehicleOwnership
        - needsReview:
            then: notifyRenewalReview
  - renewVehicleOwnership:
      call: rta-vehicle-licensing-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/vehicles/ownership/renew
        body:
          plate: "\${ $context.vehiclePlate }"
      then: issueOwnershipCertificate
  - issueOwnershipCertificate:
      emit:
        event:
          with:
            source: https://demo.rta.ae/vehicle-ownership/issued
            type: com.dubai.rta.vehicle.ownership.issued
      then: notifyOwner
  - notifyRenewalReview:
      emit:
        event:
          with:
            source: https://demo.rta.ae/vehicle-ownership/review
            type: com.dubai.rta.vehicle.renewal.review
      then: recordRenewalOutcome
  - notifyOwner:
      emit:
        event:
          with:
            source: https://demo.rta.ae/vehicle-ownership/notifications
            type: com.dubai.rta.vehicle.ownership.ready
      then: recordRenewalOutcome
  - recordRenewalOutcome:
      set:
        renewalOutcomeRecorded: true`,
  },
  {
    id: 'rta-personal-family-nol-renewal',
    label: 'RTA personal and family nol renewal',
    description: 'Authenticate a guardian → renew the personal card → manage family cards together.',
    referenceLabel: 'RTA Manage Family nol Cards',
    referenceUrl: 'https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=650',
    specification: `document:
  dsl: "1.0.3"
  namespace: dubai-government
  name: rta-personal-family-nol-renewal
  version: "1.0.0"
  metadata:
    authority: rta
    service: personal-and-family-nol-cards
    scenario: linked-card-renewal
do:
  - startFamilyCardRenewal:
      set:
        renewalDue: true
        guardianId: demo-guardian-2002
        familyCardCount: 3
      then: authenticateGuardian
  - authenticateGuardian:
      call: rta-uae-pass-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/auth/uae-pass
        headers:
          x-service: family-nol-cards
        body:
          guardianId: "\${ $context.guardianId }"
      then: renewPersonalNolCard
  - renewPersonalNolCard:
      call: rta-personal-nol-card-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/nol/personal-card/renew
        body:
          guardianId: "\${ $context.guardianId }"
      then: renewFamilyNolCards
  - renewFamilyNolCards:
      call: rta-family-nol-card-service
      with:
        method: post
        endpoint: https://demo.rta.ae/v1/nol/family-cards/manage
        body:
          guardianId: "\${ $context.guardianId }"
          cards: "\${ $context.familyCardCount }"
      then: notifyCardRenewal
  - notifyCardRenewal:
      emit:
        event:
          with:
            source: https://demo.rta.ae/nol/family-cards/renewed
            type: com.dubai.rta.nol.family-cards.renewed
      then: recordRenewalOutcome
  - recordRenewalOutcome:
      set:
        renewalOutcomeRecorded: true`,
  },
  {
    id: 'dewa-move-to',
    label: 'DEWA Move-To service',
    description:
      'Ejari event → close the old account → pay deposit → activate the new electricity and water supply.',
    referenceLabel: 'DEWA Transfer of Electricity and Water (Move-To)',
    referenceUrl: 'https://dewa.gov.ae/en/about-us/service-guide/consumer-services/move-to',
    specification: `document:
  dsl: "1.0.3"
  namespace: dubai-government
  name: dewa-move-to
  version: "1.0.0"
  metadata:
    authority: dewa
    service: move-to
    scenario: cross-service-premise-transfer
do:
  - listenForEjariEvent:
      listen:
        to:
          one:
            with:
              source: https://demo.dubailand.gov.ae/ejari-events
              type: com.dubai.rera.ejari.issued
        read: data
      then: prepareMoveTo
  - prepareMoveTo:
      set:
        oldContractAccount: demo-dewa-4004
        newPremiseNumber: premise-9009
        ejariNumber: ejari-7788
      then: checkDewaAccount
  - checkDewaAccount:
      call: dewa-account-service
      with:
        method: get
        endpoint: https://demo.dewa.gov.ae/v1/accounts/details
        query:
          account: "\${ $context.oldContractAccount }"
      then: closeOldAccount
  - closeOldAccount:
      call: dewa-move-out-service
      with:
        method: post
        endpoint: https://demo.dewa.gov.ae/v1/move-out/final-bill
        body:
          account: "\${ $context.oldContractAccount }"
      then: paySecurityDeposit
  - paySecurityDeposit:
      call: dubai-payment-service
      with:
        method: post
        endpoint: https://demo.dubai.ae/v1/payments/security-deposit
        body:
          service: dewa-move-to
          premise: "\${ $context.newPremiseNumber }"
      then: activateNewSupply
  - activateNewSupply:
      call: dewa-move-in-service
      with:
        method: post
        endpoint: https://demo.dewa.gov.ae/v1/move-in/activate
        body:
          ejari: "\${ $context.ejariNumber }"
          premise: "\${ $context.newPremiseNumber }"
      then: notifyMoveToComplete
  - notifyMoveToComplete:
      emit:
        event:
          with:
            source: https://demo.dewa.gov.ae/move-to/completed
            type: com.dubai.dewa.move-to.completed
      then: recordMoveToOutcome
  - recordMoveToOutcome:
      set:
        moveToOutcomeRecorded: true`,
  },
];
export const NEW_WORKFLOW = `document:
  dsl: "1.0.3"
  namespace: default
  name: new-workflow
  version: "0.1.0"
do: []`;

export const TASK_TEMPLATES: Record<string, TaskDefinition> = {
  set: { set: { value: '' } },
  call: { call: 'http', with: { method: 'get', endpoint: 'https://example.com' } },
  switch: { switch: [{ caseOne: { when: '${ true }', then: 'continue' } }] },
  do: { do: [{ nestedSet: { set: { value: '' } } }] },
  for: { for: { each: 'item', in: '${ $context.items }' }, do: [{ nestedSet: { set: { value: '' } } }] },
  fork: { fork: { branches: [{ branchA: { set: { value: '' } } }] } },
  emit: { emit: { event: { with: { source: 'https://example.com/source', type: 'com.example.event' } } } },
  listen: { listen: { to: { one: { with: { type: 'com.example.event' } } } } },
  raise: { raise: { error: { type: 'https://example.com/errors/example', status: 400 } } },
  run: {
    run: {
      script: {
        language: 'javascript',
        code: DEFAULT_JAVASCRIPT_TASK,
      },
    },
  },
  try: {
    try: [{ nestedSet: { set: { value: '' } } }],
    catch: { do: [{ fallback: { set: { value: '' } } }] },
  },
  wait: { wait: 'PT5S' },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toPlain = <T>(value: T): T | undefined =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
const graphPortSuffixes = ['-entry-node', '-exit-node'];

function visibleGraphNodeId(id: string): string {
  const value = String(id || '');
  if (!value.startsWith('port-')) return value;
  const suffix = graphPortSuffixes.find((candidate) => value.endsWith(candidate));
  return suffix ? value.slice('port-'.length, -suffix.length) : value;
}

type ElkInstance = InstanceType<(typeof import('elkjs/lib/elk.bundled.js'))['default']>;

let elkPromise: Promise<ElkInstance> | undefined;

const FLOW_NODE_WIDTH = 208;
const FLOW_NODE_HEIGHT = 74;
const FLOW_PORT_WIDTH = 83;
const FLOW_PORT_HEIGHT = 42;

function getElk(): Promise<ElkInstance> {
  elkPromise ||= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK());
  return elkPromise;
}

export function parseWorkflow(content: string): ParsedWorkflow {
  const document = yaml.load(content) as WorkflowDocument;
  validate('Workflow', document);
  return {
    document,
    graph: buildFlatGraph(document as unknown as SdkWorkflow),
  };
}

export function serializeWorkflow(document: WorkflowDocument, format: WorkflowFormat = 'yaml'): string {
  validate('Workflow', document);
  return format === 'json'
    ? JSON.stringify(document, null, 2)
    : yaml.dump(document, { lineWidth: -1, noRefs: true, sortKeys: false });
}

export function createFlowGraph(document: WorkflowDocument, positions: CanvasPositions = {}): FlowGraph {
  const graph = buildFlatGraph(document as unknown as SdkWorkflow);
  const graphNodes = graph.nodes.filter(
    (node) => node.type !== GraphNodeType.Entry && node.type !== GraphNodeType.Exit,
  );
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  let taskIndex = 0;
  const tasks = graphNodes.filter(
    (node) => node.type !== GraphNodeType.Start && node.type !== GraphNodeType.End,
  );
  const taskCount = tasks.length;
  const defaultTaskGap = 75;

  const nodes: FlowNode[] = graphNodes.map((node) => {
    const isPort = node.type === GraphNodeType.Start || node.type === GraphNodeType.End;
    const position: CanvasPosition =
      positions[node.id] ??
      (isPort
        ? { x: 250, y: node.type === GraphNodeType.Start ? 18 : 110 + taskCount * defaultTaskGap }
        : { x: 250, y: 70 + taskIndex++ * defaultTaskGap });

    return {
      id: node.id,
      type: isPort ? 'port' : 'task',
      position,
      data: {
        label: node.label ?? (node.type === GraphNodeType.Start ? 'Start' : 'End'),
        taskType: node.type,
        taskReference: node.taskReference,
        task: toPlain(node.task),
        portType: node.type,
      },
      draggable: true,
      selectable: true,
    };
  });

  // The SDK semantic graph can omit top-level document tasks that are not part
  // of its traversal (e.g. disconnected entries mid-list). The canvas must
  // always mirror the document, so append any missing top-level tasks.
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  (document.do ?? []).forEach((item) => {
    const name = Object.keys(item)[0];
    const id = `/do/${name}`;
    if (existingNodeIds.has(id)) return;
    const task = item[name];
    nodes.push({
      id,
      type: 'task',
      position: positions[id] ?? { x: 250, y: 140 + nodes.length * defaultTaskGap },
      data: {
        label: name,
        taskType: Object.keys(task)[0] || 'set',
        taskReference: undefined,
        task: toPlain(task),
        portType: undefined,
      },
      draggable: true,
      selectable: true,
    });
  });

  let edges: FlowEdge[] = graph.edges
    .map((edge) => ({
      id: edge.id,
      source: visibleGraphNodeId(edge.sourceId),
      target: visibleGraphNodeId(edge.targetId),
      type: 'smoothstep' as const,
      label: edge.label || undefined,
      data: { label: edge.label || '' },
      animated: Boolean(edge.label),
    }))
    .filter(
      (edge) => graphNodeIds.has(edge.source) && graphNodeIds.has(edge.target) && edge.source !== edge.target,
    );

  graphNodes
    .filter((node) => node.type === GraphNodeType.Fork)
    .forEach((forkNode) => {
      const forkTask = forkNode.task as { fork?: { branches?: unknown[] } } | undefined;
      const branchIds = (forkTask?.fork?.branches || []).flatMap((branch) => {
        const branchName = Object.keys((branch as Record<string, unknown>) || {})[0];
        return branchName ? [`${forkNode.id}/fork/branches/${branchName}`] : [];
      });
      if (!branchIds.length) return;

      const exitPortId = `port-${forkNode.id}-exit-node`;
      const continuationTargets = graph.edges
        .filter((edge) => edge.sourceId === exitPortId)
        .map((edge) => visibleGraphNodeId(edge.targetId))
        .filter((target) => graphNodeIds.has(target));
      const branchSet = new Set(branchIds);
      edges = edges.filter(
        (edge) =>
          !branchSet.has(edge.source) &&
          !branchSet.has(edge.target) &&
          !(edge.source === forkNode.id && continuationTargets.includes(edge.target)),
      );

      branchIds.forEach((branchId, index) => {
        if (!graphNodeIds.has(branchId)) return;
        edges.push({
          id: `${forkNode.id}-branch-${index}`,
          source: forkNode.id,
          target: branchId,
          type: 'smoothstep',
          label: branchId.slice(`${forkNode.id}/fork/branches/`.length),
          data: { label: branchId.slice(`${forkNode.id}/fork/branches/`.length) },
          animated: true,
        });
        continuationTargets.forEach((target) => {
          edges.push({
            id: `${branchId}-${target}-${index}`,
            source: branchId,
            target,
            type: 'smoothstep',
            label: undefined,
            data: { label: '' },
            animated: false,
          });
        });
      });
    });

  return { nodes, edges };
}

export async function autoLayoutFlow(document: WorkflowDocument): Promise<CanvasPositions> {
  const elk = await getElk();
  const flow = createFlowGraph(document);
  const layout = await elk.layout({
    id: 'workflow-layout',
    children: flow.nodes.map((node) => ({
      id: node.id,
      width: node.type === 'port' ? FLOW_PORT_WIDTH : FLOW_NODE_WIDTH,
      height: node.type === 'port' ? FLOW_PORT_HEIGHT : FLOW_NODE_HEIGHT,
    })),
    edges: flow.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': '54',
      'elk.layered.spacing.edgeNodeBetweenLayers': '26',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
  });

  return Object.fromEntries(
    (layout.children || []).map((node): [string, CanvasPosition] => [
      node.id,
      { x: node.x || 0, y: node.y || 0 },
    ]),
  );
}

export interface TopLevelTask {
  id: string;
  index: number;
  name: string;
  task: TaskDefinition;
  type: string;
}

export function getTopLevelTask(document: WorkflowDocument, nodeId: string | null): TopLevelTask | null {
  const taskName = nodeId?.startsWith('/do/') ? nodeId.slice('/do/'.length) : null;
  if (!taskName || taskName.includes('/')) return null;
  const doList = document.do ?? [];
  const index = doList.findIndex((item) => Object.hasOwn(item, taskName));
  if (index < 0) return null;
  const task = doList[index][taskName];
  return {
    id: `/do/${taskName}`,
    index,
    name: taskName,
    task,
    type: Object.keys(task)[0],
  };
}

/** A single segment of the canvas breadcrumb chain. */
export interface BreadcrumbSegment {
  label: string;
  /** Node id to select when clicked; `null` for structural separators (`do`, `fork`, `branches`, `try`, `catch`). */
  taskId: string | null;
}

const taskNameOf = (item: TaskItem): string => Object.keys(item)[0];

/**
 * Resolve a canvas node id into a breadcrumb chain that walks through
 * container tasks (`do`, `for`, `fork`, `try`/`catch`) down to the selected
 * task. Top-level tasks produce `[do, <name>]`; nested tasks produce paths
 * like `do / processItems / do / transformRecord` or
 * `do / dispatchParallelChannels / fork / branches / sendEmail`.
 */
export function getBreadcrumbPath(document: WorkflowDocument, nodeId: string | null): BreadcrumbSegment[] {
  if (!nodeId || !nodeId.startsWith('/do/')) return [];
  const parts = nodeId.split('/').filter(Boolean);
  if (parts[0] !== 'do') return [];

  const segments: BreadcrumbSegment[] = [{ label: 'do', taskId: null }];
  let list: TaskItem[] = document.do ?? [];
  let i = 1;

  while (i < parts.length) {
    const name = parts[i];
    const item = list.find((entry) => taskNameOf(entry) === name);
    if (!item) return [];
    const task = item[name];
    segments.push({ label: name, taskId: `/${parts.slice(0, i + 1).join('/')}` });

    // `do` and `for` tasks both nest their sub-tasks under `task.do`.
    if (Array.isArray(task.do)) {
      if (parts[i + 1] !== 'do') return [];
      segments.push({ label: 'do', taskId: null });
      list = task.do;
      i += 2;
      continue;
    }
    if (task.fork && Array.isArray(task.fork.branches)) {
      if (parts[i + 1] !== 'fork' || parts[i + 2] !== 'branches') return [];
      segments.push({ label: 'fork', taskId: null }, { label: 'branches', taskId: null });
      list = task.fork.branches as TaskItem[];
      i += 3;
      continue;
    }
    if (Array.isArray(task.try) || (task.catch && Array.isArray(task.catch.do))) {
      if (Array.isArray(task.try) && parts[i + 1] === 'try') {
        segments.push({ label: 'try', taskId: null });
        list = task.try;
        i += 2;
        continue;
      }
      if (task.catch && Array.isArray(task.catch.do) && parts[i + 1] === 'catch' && parts[i + 2] === 'do') {
        segments.push({ label: 'catch', taskId: null }, { label: 'do', taskId: null });
        list = task.catch.do;
        i += 3;
        continue;
      }
      return [];
    }

    // Leaf task — no further nesting should remain in the id.
    if (i !== parts.length - 1) return [];
    i += 1;
  }

  return segments;
}

export function addTopLevelTask(document: WorkflowDocument, taskType: string): WorkflowDocument {
  const next = clone(document);
  const nextDo: TaskItem[] = next.do ?? [];
  const baseName = `${taskType}Task`;
  let name = baseName;
  let suffix = 2;
  while (nextDo.some((item) => Object.hasOwn(item, name))) name = `${baseName}${suffix++}`;

  const task = clone(TASK_TEMPLATES[taskType] || TASK_TEMPLATES.set);

  nextDo.push({ [name]: task });
  next.do = nextDo;
  validate('Workflow', next);
  return next;
}

export function updateTopLevelTaskName(
  document: WorkflowDocument,
  nodeId: string | null,
  nextName: string,
): WorkflowDocument {
  const selected = getTopLevelTask(document, nodeId);
  const cleanName = nextName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (
    !selected ||
    !cleanName ||
    cleanName === selected.name ||
    (document.do ?? []).some((item) => Object.hasOwn(item, cleanName))
  )
    return document;

  const next = clone(document);
  (next.do ?? [])[selected.index] = { [cleanName]: (next.do ?? [])[selected.index][selected.name] };
  return next;
}

export function updateTopLevelTaskConfig(
  document: WorkflowDocument,
  nodeId: string | null,
  config: unknown,
): WorkflowDocument {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected || !config || typeof config !== 'object' || Array.isArray(config)) return document;

  const next = clone(document);
  (next.do ?? [])[selected.index] = { [selected.name]: config as TaskDefinition };
  return next;
}

export function duplicateTopLevelTask(document: WorkflowDocument, nodeId: string | null): WorkflowDocument {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected) return document;

  const next = clone(document);
  const nextDo = next.do ?? [];
  const baseName = `${selected.name}-copy`;
  let name = baseName;
  let suffix = 2;
  while (nextDo.some((item) => Object.hasOwn(item, name))) name = `${baseName}-${suffix++}`;

  const duplicate = clone(selected.task);
  delete duplicate.then;
  // Append at the end (like addTopLevelTask): the SDK semantic graph drops
  // tasks inserted mid-chain that are not reachable, which would hide the
  // duplicate from the canvas while keeping it in the document.
  nextDo.push({ [name]: duplicate });
  return next;
}

export function updateTopLevelTaskField(
  document: WorkflowDocument,
  nodeId: string | null,
  path: Array<string | number>,
  value: unknown,
): WorkflowDocument {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected || !Array.isArray(path) || path.length === 0) return document;

  const next = clone(document);
  let target = (next.do ?? [])[selected.index][selected.name] as Record<string, unknown>;
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key] as Record<string, unknown>;
  });
  const lastKey = path[path.length - 1];
  if (value === undefined) {
    delete target[lastKey];
  } else {
    target[lastKey] = value;
  }
  validate('Workflow', next);
  return next;
}

export function removeTopLevelTask(document: WorkflowDocument, nodeId: string | null): WorkflowDocument {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected) return document;
  const next = clone(document);
  const nextDo = next.do ?? [];
  nextDo.splice(selected.index, 1);
  nextDo.forEach((item) => {
    const task = item[Object.keys(item)[0]];
    if (task?.then === selected.name) delete task.then;
  });
  return next;
}

function followsThen(document: WorkflowDocument, startName: string, targetName: string): boolean {
  const seen = new Set<string>();
  let current: string | null = startName;
  while (current && !seen.has(current)) {
    if (current === targetName) return true;
    seen.add(current);
    const task: TaskDefinition | undefined = getTopLevelTask(document, `/do/${current}`)?.task;
    current = typeof task?.then === 'string' ? task.then : null;
  }
  return false;
}

export function connectTopLevelTasks(
  document: WorkflowDocument,
  sourceId: string,
  targetId: string,
): WorkflowDocument {
  const source = getTopLevelTask(document, sourceId);
  const target = getTopLevelTask(document, targetId);
  if (!source || !target || source.name === target.name) return document;
  if (followsThen(document, target.name, source.name)) return document;

  const next = clone(document);
  const sourceTask = (next.do ?? [])[source.index][source.name];
  sourceTask.then = target.name;
  validate('Workflow', next);
  return next;
}

export function disconnectTopLevelTasks(
  document: WorkflowDocument,
  sourceId: string,
  targetId: string,
): WorkflowDocument {
  const source = getTopLevelTask(document, sourceId);
  const target = getTopLevelTask(document, targetId);
  if (!source || !target) return document;

  const next = clone(document);
  const sourceTask = (next.do ?? [])[source.index][source.name];
  if (sourceTask.then === target.name) delete sourceTask.then;
  return next;
}

export function validateGraph(document: WorkflowDocument): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const doList = document.do ?? [];
  const names = new Set<string>();

  doList.forEach((item) => {
    const name = Object.keys(item)[0];
    if (names.has(name)) issues.push({ path: `/do/${name}`, message: 'Task name is duplicated.' });
    names.add(name);
  });

  const availableFunctions = new Set(Object.keys(document.use?.functions || {}));
  if (document.use?.functions) {
    const fns = document.use.functions;
    Object.keys(fns).forEach((fnName) => {
      const def = fns[fnName];
      if (!def || typeof def !== 'object') {
        issues.push({
          path: `/use/functions/${fnName}`,
          message: `Function definition for “${fnName}” is invalid.`,
        });
      }
    });
  }
  doList.forEach((item) => {
    const name = Object.keys(item)[0];
    const task = item[name];
    if (typeof task.then === 'string' && !names.has(task.then)) {
      issues.push({ path: `/do/${name}/then`, message: `Task target “${task.then}” does not exist.` });
    }
    if (typeof task.call === 'string') {
      const isHttp = Boolean(task.with && (task.with.endpoint || task.with.method));
      if (!isHttp && !task.call.startsWith('http://') && !task.call.startsWith('https://')) {
        if (document.use?.functions && !availableFunctions.has(task.call)) {
          issues.push({
            path: `/do/${name}/call`,
            message: `Function call target “${task.call}” is not defined in use.functions.`,
          });
        }
      }
    }
  });

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) {
      issues.push({ path: `/do/${name}/then`, message: 'The workflow contains a cycle.' });
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const task = getTopLevelTask(document, `/do/${name}`)?.task;
    if (typeof task?.then === 'string' && names.has(task.then)) visit(task.then);
    visiting.delete(name);
    visited.add(name);
  };
  names.forEach(visit);

  try {
    const graph = buildFlatGraph(document as unknown as SdkWorkflow);
    const adjacency = new Map<string, string[]>();
    graph.edges.forEach((edge) => {
      const source = visibleGraphNodeId(edge.sourceId);
      const target = visibleGraphNodeId(edge.targetId);
      const targets = adjacency.get(source) || [];
      targets.push(target);
      adjacency.set(source, targets);
    });
    const reachable = new Set(['root-entry-node']);
    const queue = ['root-entry-node'];
    while (queue.length) {
      const current = queue.shift() as string;
      (adjacency.get(current) || []).forEach((target) => {
        if (!reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      });
    }
    names.forEach((name) => {
      if (!reachable.has(`/do/${name}`)) {
        issues.push({ path: `/do/${name}`, message: 'Task is unreachable from the workflow start.' });
      }
    });
  } catch {
    // Schema-valid documents with dangling graph references are reported above.
  }

  return issues;
}

export interface SubflowReference {
  namespace: string;
  name: string;
  version?: string;
  /** Top-level task delegating (transitively) — the canvas selection target. */
  topLevelName: string;
}

/**
 * Collect every `run.workflow` delegation in a document, walking all task
 * containers (`do`/`for`, `fork.branches`, `try`, `catch.do`) and deduping by
 * `${namespace}/${name}`.
 */
export function collectSubflowReferences(document: WorkflowDocument): SubflowReference[] {
  const seen = new Set<string>();
  const references: SubflowReference[] = [];
  const visit = (list: TaskItem[] | undefined, topLevelName: string) => {
    for (const item of list ?? []) {
      const taskName = Object.keys(item)[0];
      const task: TaskDefinition = item[taskName];
      const workflow = task.run?.workflow;
      if (workflow?.namespace && workflow.name) {
        const key = `${workflow.namespace}/${workflow.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          references.push({
            namespace: workflow.namespace,
            name: workflow.name,
            version: workflow.version,
            topLevelName,
          });
        }
      }
      visit(task.do, topLevelName);
      visit(task.fork?.branches, topLevelName);
      visit(task.try, topLevelName);
      visit(task.catch?.do, topLevelName);
    }
  };
  for (const item of document.do ?? []) visit([item], Object.keys(item)[0]);
  return references.sort((left, right) =>
    `${left.namespace}/${left.name}`.localeCompare(`${right.namespace}/${right.name}`),
  );
}

/** Structural target of a `run.workflow` delegation (namespace+name, optional version pin). */
export interface SubflowTargetLike {
  namespace?: string;
  name?: string;
  version?: string;
}

/**
 * Resolve a `run.workflow` delegation target against workspace documents
 * (open tabs / saved records). An exact `namespace` + `name` + pinned
 * `version` match wins over same-named documents with other versions; without
 * an exact version hit the first `namespace` + `name` document is used (the
 * pin is advisory on legacy/edited documents, preserving prior behavior).
 * Shared by the demo engine and the deployment bundle so both resolve
 * delegation targets identically (Task 61).
 */
export function findSubflowDocumentMatch(
  documents: readonly WorkflowDocument[],
  target: SubflowTargetLike,
): WorkflowDocument | undefined {
  const byNamespaceName = (candidate: WorkflowDocument): boolean =>
    candidate.document?.namespace === target.namespace && candidate.document?.name === target.name;
  if (target.version) {
    const exact = documents.find(
      (candidate) => byNamespaceName(candidate) && candidate.document?.version === target.version,
    );
    if (exact) return exact;
  }
  return documents.find(byNamespaceName);
}

/**
 * Problem-panel warnings for `run.workflow` targets with neither a workspace
 * document (open tab / saved library) nor a canonical AI contract — the bundle
 * cannot ship them and the demo engine can only simulate them.
 */
export function detectMissingSubflowReferences(
  document: WorkflowDocument,
  workspaceDocuments: readonly WorkflowDocument[] = [],
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  for (const reference of collectSubflowReferences(document)) {
    const provided = workspaceDocuments.some(
      (candidate) =>
        candidate.document?.namespace === reference.namespace && candidate.document?.name === reference.name,
    );
    const canonical = findAiComponentBySubflow(reference.namespace, reference.name) !== undefined;
    if (!provided && !canonical) {
      issues.push({
        path: `/do/${reference.topLevelName}`,
        message: `Sub-flow target “${reference.namespace}/${reference.name}” has no document in the workspace. Open or scaffold it before deploying.`,
        subflowTarget: { namespace: reference.namespace, name: reference.name },
      });
    }
  }
  return issues;
}
