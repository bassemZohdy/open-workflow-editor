import { buildFlatGraph, validate } from '@openworkflowspec/sdk';
import * as yaml from 'js-yaml';
import { DEFAULT_JAVASCRIPT_TASK } from './scriptContract';

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

export const SMART_CITY_WORKFLOWS = [
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

export const TASK_TEMPLATES = {
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

const clone = (value) => JSON.parse(JSON.stringify(value));

const toPlain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const graphPortSuffixes = ['-entry-node', '-exit-node'];

function visibleGraphNodeId(id) {
  const value = String(id || '');
  if (!value.startsWith('port-')) return value;
  const suffix = graphPortSuffixes.find((candidate) => value.endsWith(candidate));
  return suffix ? value.slice('port-'.length, -suffix.length) : value;
}

let elkPromise;

const FLOW_NODE_WIDTH = 208;
const FLOW_NODE_HEIGHT = 62;
const FLOW_PORT_WIDTH = 83;
const FLOW_PORT_HEIGHT = 42;

function getElk() {
  elkPromise ||= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK());
  return elkPromise;
}

export function parseWorkflow(content) {
  const document = yaml.load(content);
  validate('Workflow', document);
  return {
    document,
    graph: buildFlatGraph(document),
  };
}

export function serializeWorkflow(document, format = 'yaml') {
  validate('Workflow', document);
  return format === 'json'
    ? JSON.stringify(document, null, 2)
    : yaml.dump(document, { lineWidth: -1, noRefs: true, sortKeys: false });
}

export function createFlowGraph(document, positions = {}) {
  const graph = buildFlatGraph(document);
  const graphNodes = graph.nodes.filter((node) => node.type !== 'entry' && node.type !== 'exit');
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  let taskIndex = 0;
  const tasks = graphNodes.filter((node) => node.type !== 'start' && node.type !== 'end');
  const taskCount = tasks.length;
  const defaultTaskGap = 50;

  const nodes = graphNodes.map((node) => {
    const isPort = node.type === 'start' || node.type === 'end';
    const position =
      positions[node.id] ??
      (isPort
        ? { x: 250, y: node.type === 'start' ? 18 : 110 + taskCount * defaultTaskGap }
        : { x: 250, y: 70 + taskIndex++ * defaultTaskGap });

    return {
      id: node.id,
      type: isPort ? 'port' : 'task',
      position,
      data: {
        label: node.label ?? (node.type === 'start' ? 'Start' : 'End'),
        taskType: node.type,
        taskReference: node.taskReference,
        task: toPlain(node.task),
        portType: node.type,
      },
      draggable: true,
      selectable: true,
    };
  });

  let edges = graph.edges
    .map((edge) => ({
      id: edge.id,
      source: visibleGraphNodeId(edge.sourceId),
      target: visibleGraphNodeId(edge.targetId),
      type: 'smoothstep',
      label: edge.label || undefined,
      data: { label: edge.label || '' },
      animated: Boolean(edge.label),
    }))
    .filter(
      (edge) => graphNodeIds.has(edge.source) && graphNodeIds.has(edge.target) && edge.source !== edge.target,
    );

  graphNodes
    .filter((node) => node.type === 'fork')
    .forEach((forkNode) => {
      const branchIds = (forkNode.task?.fork?.branches || []).flatMap((branch) => {
        const branchName = Object.keys(branch || {})[0];
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

export async function autoLayoutFlow(document) {
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
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '44',
      'elk.layered.spacing.edgeNodeBetweenLayers': '22',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
  });

  return Object.fromEntries(
    (layout.children || []).map((node) => [node.id, { x: node.x || 0, y: node.y || 0 }]),
  );
}

export function getTopLevelTask(document, nodeId) {
  const taskName = nodeId?.startsWith('/do/') ? nodeId.slice('/do/'.length) : null;
  if (!taskName || taskName.includes('/')) return null;
  const index = document.do.findIndex((item) => Object.hasOwn(item, taskName));
  if (index < 0) return null;
  return {
    index,
    name: taskName,
    task: document.do[index][taskName],
    type: Object.keys(document.do[index][taskName])[0],
  };
}

export function addTopLevelTask(document, taskType) {
  const next = clone(document);
  const baseName = `${taskType}Task`;
  let name = baseName;
  let suffix = 2;
  while (next.do.some((item) => Object.hasOwn(item, name))) name = `${baseName}${suffix++}`;

  const task = clone(TASK_TEMPLATES[taskType] || TASK_TEMPLATES.set);

  next.do.push({ [name]: task });
  validate('Workflow', next);
  return next;
}

export function updateTopLevelTaskName(document, nodeId, nextName) {
  const selected = getTopLevelTask(document, nodeId);
  const cleanName = nextName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (
    !selected ||
    !cleanName ||
    cleanName === selected.name ||
    document.do.some((item) => Object.hasOwn(item, cleanName))
  )
    return document;

  const next = clone(document);
  next.do[selected.index] = { [cleanName]: next.do[selected.index][selected.name] };
  return next;
}

export function updateTopLevelTaskConfig(document, nodeId, config) {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected || !config || typeof config !== 'object' || Array.isArray(config)) return document;

  const next = clone(document);
  next.do[selected.index] = { [selected.name]: config };
  return next;
}

export function duplicateTopLevelTask(document, nodeId) {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected) return document;

  const next = clone(document);
  const baseName = `${selected.name}-copy`;
  let name = baseName;
  let suffix = 2;
  while (next.do.some((item) => Object.hasOwn(item, name))) name = `${baseName}-${suffix++}`;

  const duplicate = clone(selected.task);
  delete duplicate.then;
  next.do.splice(selected.index + 1, 0, { [name]: duplicate });
  validate('Workflow', next);
  return next;
}

export function updateTopLevelTaskField(document, nodeId, path, value) {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected || !Array.isArray(path) || path.length === 0) return document;

  const next = clone(document);
  let target = next.do[selected.index][selected.name];
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  });
  target[path[path.length - 1]] = value;
  validate('Workflow', next);
  return next;
}

export function removeTopLevelTask(document, nodeId) {
  const selected = getTopLevelTask(document, nodeId);
  if (!selected) return document;
  const next = clone(document);
  next.do.splice(selected.index, 1);
  next.do.forEach((item) => {
    const task = item[Object.keys(item)[0]];
    if (task?.then === selected.name) delete task.then;
  });
  return next;
}

function followsThen(document, startName, targetName) {
  const seen = new Set();
  let current = startName;
  while (current && !seen.has(current)) {
    if (current === targetName) return true;
    seen.add(current);
    const task = getTopLevelTask(document, `/do/${current}`)?.task;
    current = typeof task?.then === 'string' ? task.then : null;
  }
  return false;
}

export function connectTopLevelTasks(document, sourceId, targetId) {
  const source = getTopLevelTask(document, sourceId);
  const target = getTopLevelTask(document, targetId);
  if (!source || !target || source.name === target.name) return document;
  if (followsThen(document, target.name, source.name)) return document;

  const next = clone(document);
  const sourceTask = next.do[source.index][source.name];
  sourceTask.then = target.name;
  validate('Workflow', next);
  return next;
}

export function disconnectTopLevelTasks(document, sourceId, targetId) {
  const source = getTopLevelTask(document, sourceId);
  const target = getTopLevelTask(document, targetId);
  if (!source || !target) return document;

  const next = clone(document);
  const sourceTask = next.do[source.index][source.name];
  if (sourceTask.then === target.name) delete sourceTask.then;
  return next;
}

export function validateGraph(document) {
  const issues = [];
  const names = new Set();

  document.do.forEach((item) => {
    const name = Object.keys(item)[0];
    if (names.has(name)) issues.push({ path: `/do/${name}`, message: 'Task name is duplicated.' });
    names.add(name);
  });

  document.do.forEach((item) => {
    const name = Object.keys(item)[0];
    const task = item[name];
    if (typeof task.then === 'string' && !names.has(task.then)) {
      issues.push({ path: `/do/${name}/then`, message: `Task target “${task.then}” does not exist.` });
    }
  });

  const visited = new Set();
  const visiting = new Set();
  const visit = (name) => {
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
    const graph = buildFlatGraph(document);
    const adjacency = new Map();
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
      const current = queue.shift();
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
