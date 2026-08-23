import {
  AI_TASK_SPECS,
  collectSubflowReferences,
  createAiSubflowDocument,
  parseWorkflow,
  serializeWorkflow,
} from './workflowModel';
import type { WorkflowDocument } from './types';

export interface DeploymentBundle {
  workflowName: string;
  workflowYaml: string;
  dockerfile: string;
  kubernetesYaml: string;
  readmeMd: string;
  /** Runnable sub-flow definitions shipped as `subflows/<namespace>/<name>.yaml`. */
  subflows: SubflowArtifact[];
  /** Referenced sub-flows with no available document and no canonical builder. */
  unresolvedSubflowTargets: SubflowTarget[];
}

export interface SubflowTarget {
  namespace: string;
  name: string;
  version?: string;
}

export interface SubflowArtifact extends SubflowTarget {
  /** `document` = the user's document (open tab / saved workflow); `ai-contract` = canonical AI builder. */
  source: 'document' | 'ai-contract';
  /** Serialized `subflows/<namespace>/<name>.yaml` content. */
  yaml: string;
}

export interface SubflowCollection {
  artifacts: SubflowArtifact[];
  unresolved: SubflowTarget[];
}

/**
 * Materialize the runnable sub-flow definitions for a workflow's delegations:
 * - a document from the workspace matching `namespace` + `name` wins (the
 *   user's live sub-flow, including edits);
 * - otherwise AI sub-flows fall back to the canonical catalog-backed builder;
 * - anything else stays `unresolved` (reported in the bundle README).
 */
export function findSubflowDelegations(
  specYaml: string,
  availableDocuments: readonly WorkflowDocument[] = [],
): SubflowCollection {
  let document: WorkflowDocument;
  try {
    document = parseWorkflow(specYaml).document;
  } catch {
    return { artifacts: [], unresolved: [] };
  }

  const artifacts: SubflowArtifact[] = [];
  const unresolved: SubflowTarget[] = [];

  for (const target of collectSubflowReferences(document)) {
    const provided = availableDocuments.find(
      (candidate) =>
        candidate.document?.namespace === target.namespace && candidate.document?.name === target.name,
    );
    if (provided) {
      artifacts.push({
        ...target,
        source: 'document',
        yaml: serializeWorkflow(provided, 'yaml'),
      });
      continue;
    }
    const aiSpec = AI_TASK_SPECS.find(
      (candidate) => candidate.subflowNamespace === target.namespace && candidate.subflowName === target.name,
    );
    if (aiSpec) {
      artifacts.push({
        ...target,
        source: 'ai-contract',
        yaml: serializeWorkflow(createAiSubflowDocument(aiSpec.kind), 'yaml'),
      });
      continue;
    }
    unresolved.push(target);
  }

  return { artifacts, unresolved };
}

const indentYaml = (yaml: string): string =>
  yaml
    .split('\n')
    .map((line) => (line.trim() ? `    ${line}` : line))
    .join('\n');

const subflowKey = (target: SubflowTarget): string => `subflows/${target.namespace}/${target.name}.yaml`;
const subflowMount = (target: SubflowTarget): string =>
  `/app/subflows/${target.namespace}/${target.name}.yaml`;

export function generateDeploymentBundle(
  specYaml: string,
  workflowName = 'workflow',
  availableDocuments: readonly WorkflowDocument[] = [],
): DeploymentBundle {
  const safeName =
    (workflowName || 'workflow')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'workflow';

  const { artifacts, unresolved } = findSubflowDelegations(specYaml, availableDocuments);
  const indentedSpec = indentYaml(specYaml);
  const subflowDataBlock = artifacts
    .map((artifact) => `  ${subflowKey(artifact)}: |\n${indentYaml(artifact.yaml)}`)
    .join('\n');
  const subflowMounts = artifacts.map((artifact) => subflowMount(artifact)).join(', ');

  const dockerfile = `# Open Workflow Specification 1.0.3 Production Runtime Container
FROM openworkflow/runtime:1.0.3
LABEL maintainer="Open Workflow Editor"
LABEL org.opencontainers.image.title="${safeName}"

WORKDIR /app
COPY workflow.yaml /app/workflow.yaml
${
  artifacts.length
    ? `# Referenced sub-flow definitions (see README "Sub-flows")
COPY subflows/ /app/subflows/
ENV WORKFLOW_SUBFLOW_PATH=/app/subflows
`
    : ''
}ENV WORKFLOW_SPEC_PATH=/app/workflow.yaml
ENV PORT=8080

EXPOSE 8080
CMD ["open-workflow-runtime", "--spec", "/app/workflow.yaml", "--port", "8080"]
`;

  const kubernetesYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${safeName}-spec
  labels:
    app.kubernetes.io/name: ${safeName}
    app.kubernetes.io/part-of: open-workflow
data:
  workflow.yaml: |
${indentedSpec}
${subflowDataBlock}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${safeName}-deployment
  labels:
    app.kubernetes.io/name: ${safeName}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${safeName}
  template:
    metadata:
      labels:
        app: ${safeName}
    spec:
      containers:
        - name: workflow-runner
          image: openworkflow/runtime:1.0.3
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: http
          env:
            - name: WORKFLOW_SPEC_PATH
              value: /app/workflow.yaml
${
  artifacts.length
    ? `            - name: WORKFLOW_SUBFLOW_PATH
              value: /app/subflows
`
    : ''
}          volumeMounts:
            - name: spec-volume
              mountPath: /app/workflow.yaml
              subPath: workflow.yaml
${artifacts
  .map(
    (artifact) => `            - name: spec-volume
              mountPath: ${subflowMount(artifact)}
              subPath: ${subflowKey(artifact)}`,
  )
  .join('\n')}          resources:
            limits:
              cpu: "1000m"
              memory: "512Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
      volumes:
        - name: spec-volume
          configMap:
            name: ${safeName}-spec
            items:
              - key: workflow.yaml
                path: workflow.yaml
${artifacts
  .map(
    (artifact) => `              - key: ${subflowKey(artifact)}
                path: ${subflowKey(artifact)}`,
  )
  .join('\n')}
---
apiVersion: v1
kind: Service
metadata:
  name: ${safeName}-service
  labels:
    app.kubernetes.io/name: ${safeName}
spec:
  type: ClusterIP
  selector:
    app: ${safeName}
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8080
`;

  const subflowBullets = artifacts
    .map(
      (artifact) =>
        `- \`${subflowKey(artifact)}\` — ${artifact.source === 'document' ? 'your sub-flow document' : 'canonical AI contract stub (replace after customizing)'}`,
    )
    .join('\n');

  const unresolvedNote = unresolved.length
    ? `

> **Unresolved sub-flow references:** ${unresolved
        .map((target) => `\`${target.namespace}/${target.name}\``)
        .join(
          ', ',
        )} have no document in the workspace and no built-in contract — open/implement them (or save them into the library) before deploying, or the runtime cannot resolve these delegations.`
    : '';

  const subflowSection = artifacts.length
    ? `

## Sub-flows

This workflow delegates via \`run.workflow\` to ${artifacts.length === 1 ? 'one sub-flow' : `${artifacts.length} sub-flows`}. The bundle ships their runnable definitions and wires them into the deployed service:

${subflowBullets}

The Dockerfile copies the \`subflows/\` directory into the image and the Kubernetes Deployment mounts each file under **${subflowMounts}** with \`WORKFLOW_SUBFLOW_PATH=/app/subflows\`. When a sub-flow exists as a document in the workspace (open tab or saved workflow), the bundle ships your edited version; AI sub-flows without a document fall back to the canonical contract (see \`docs/ai-tasks.md\`) — replace them before deploying if you customized them elsewhere.${unresolvedNote}
`
    : '';

  const readmeMd = `# ${workflowName} — Open Workflow Deployment Bundle

This bundle contains production deployment manifests for the **${workflowName}** Open Workflow 1.0.3 specification.

## Manifest Contents

- \`workflow.yaml\` — Complete workflow specification
${subflowBullets}
- \`Dockerfile\` — Container build definition targeting the official runtime
- \`deployment.yaml\` — Kubernetes ConfigMap, Deployment, and Service definitions

## 1. Local Container Execution (Docker)

Build and run the containerized workflow service:

\`\`\`bash
# Build the container image
docker build -t ${safeName}:1.0.0 .

# Run with port forwarding
docker run -d -p 8080:8080 --name ${safeName} ${safeName}:1.0.0

# Verify health status
curl http://localhost:8080/health
\`\`\`

## 2. Kubernetes Deployment

Deploy the workflow definition into your Kubernetes cluster:

\`\`\`bash
# Apply ConfigMap, Deployment, and Service
kubectl apply -f deployment.yaml

# Check rollout status
kubectl rollout status deployment/${safeName}-deployment

# Port-forward to test locally
kubectl port-forward svc/${safeName}-service 8080:80
\`\`\`

## 3. Remote Runtime Gateway Execution

Trigger a workflow run against your deployed instance:

\`\`\`bash
curl -X POST http://localhost:8080/runs \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {}}'
\`\`\`
${subflowSection}`;

  return {
    workflowName,
    workflowYaml: specYaml,
    dockerfile,
    kubernetesYaml,
    readmeMd,
    subflows: artifacts,
    unresolvedSubflowTargets: unresolved,
  };
}
