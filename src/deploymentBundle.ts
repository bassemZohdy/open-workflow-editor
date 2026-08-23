import { AI_TASK_SPECS, createAiSubflowDocument, parseWorkflow, serializeWorkflow } from './workflowModel';
import type { TaskDefinition, TaskItem } from './types';

export interface DeploymentBundle {
  workflowName: string;
  workflowYaml: string;
  dockerfile: string;
  kubernetesYaml: string;
  readmeMd: string;
  /** Canonical runnable definitions for every referenced AI sub-flow. */
  aiSubflows: AiSubflowArtifact[];
}

export interface AiSubflowArtifact {
  /** Sub-flow name (`prompt-llm` or `ai-agent`). */
  name: string;
  /** AI task kind used to build the canonical sub-flow document. */
  kind: 'llm-call' | 'ai-agent-call';
  /** Serialized `ai/<name>.yaml` content (canonical catalog-backed contract). */
  yaml: string;
}

/**
 * Collect the AI sub-flows a workflow delegates to (`run.workflow` in the `ai`
 * namespace), walking every task container (`do`/`for`, `fork.branches`,
 * `try`, `catch.do`). Each referenced sub-flow yields exactly one artifact
 * (deduped by name); only canonical names (`AI_TASK_SPECS`) are materialized
 * — exotic names are reported via the README instead of guessing content.
 */
export function findAiDelegations(specYaml: string): AiSubflowArtifact[] {
  let document;
  try {
    document = parseWorkflow(specYaml).document;
  } catch {
    return [];
  }

  const found = new Map<string, 'llm-call' | 'ai-agent-call'>();
  const visit = (list: TaskItem[] | undefined) => {
    for (const item of list ?? []) {
      const taskName = Object.keys(item)[0];
      const task: TaskDefinition = item[taskName];
      const workflow = task.run?.workflow;
      if (workflow?.namespace === 'ai' && workflow.name) {
        const spec = AI_TASK_SPECS.find((candidate) => candidate.subflowName === workflow.name);
        if (spec && !found.has(workflow.name)) found.set(workflow.name, spec.kind);
      }
      visit(task.do);
      visit(task.fork?.branches);
      visit(task.try);
      visit(task.catch?.do);
    }
  };
  visit(document.do);

  return [...found.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, kind]) => ({
      name,
      kind,
      yaml: serializeWorkflow(createAiSubflowDocument(kind), 'yaml'),
    }));
}

const indentYaml = (yaml: string): string =>
  yaml
    .split('\n')
    .map((line) => (line.trim() ? `    ${line}` : line))
    .join('\n');

export function generateDeploymentBundle(specYaml: string, workflowName = 'workflow'): DeploymentBundle {
  const safeName =
    (workflowName || 'workflow')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'workflow';

  const aiSubflows = findAiDelegations(specYaml);
  const indentedSpec = indentYaml(specYaml);
  const aiSubflowBlock = aiSubflows
    .map((artifact) => `  ai/${artifact.name}.yaml: |\n${indentYaml(artifact.yaml)}`)
    .join('\n');
  const aiSubflowPaths = aiSubflows.map((artifact) => `/app/ai/${artifact.name}.yaml`).join(', ');

  const dockerfile = `# Open Workflow Specification 1.0.3 Production Runtime Container
FROM openworkflow/runtime:1.0.3
LABEL maintainer="Open Workflow Editor"
LABEL org.opencontainers.image.title="${safeName}"

WORKDIR /app
COPY workflow.yaml /app/workflow.yaml
${
  aiSubflows.length
    ? `# Referenced AI sub-flow definitions (see README "AI Sub-flows")
COPY ai/ /app/ai/
ENV WORKFLOW_SUBFLOW_PATH=/app/ai
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
${aiSubflowBlock}
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
  aiSubflows.length
    ? `            - name: WORKFLOW_SUBFLOW_PATH
              value: /app/ai
`
    : ''
}          volumeMounts:
            - name: spec-volume
              mountPath: /app/workflow.yaml
              subPath: workflow.yaml
${aiSubflows
  .map(
    (artifact) => `            - name: spec-volume
              mountPath: /app/ai/${artifact.name}.yaml
              subPath: ai/${artifact.name}.yaml`,
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
${aiSubflows
  .map(
    (artifact) => `              - key: ai/${artifact.name}.yaml
                path: ai/${artifact.name}.yaml`,
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

  const aiManifestBullets = aiSubflows
    .map((artifact) => `- \`ai/${artifact.name}.yaml\` — Runnable AI sub-flow definition (contract stub)`)
    .join('\n');

  const aiSection = aiSubflows.length
    ? `

## 4. AI Sub-flows

This workflow delegates to AI sub-flow${aiSubflows.length > 1 ? 's' : ''} via \`run.workflow\` in the \`ai\` namespace. The bundle ships their runnable definitions and wires them into the deployed service:

${aiSubflows.map((artifact) => `- \`ai/${artifact.name}.yaml\` for \`ai/${artifact.name}\` (\`/app/ai/${artifact.name}.yaml\`)`).join('\n')}

The Dockerfile copies the \`ai/\` directory into the image and the Kubernetes Deployment mounts each file at **${aiSubflowPaths}** with \`WORKFLOW_SUBFLOW_PATH=/app/ai\`. Sub-flow YAMLs are generated from the editor's canonical AI contracts (catalog-backed provider + runnable script stub, see \`docs/ai-tasks.md\`) — if you customized a sub-flow in the editor, replace the matching file before deploying.
`
    : '';

  const readmeMd = `# ${workflowName} — Open Workflow Deployment Bundle

This bundle contains production deployment manifests for the **${workflowName}** Open Workflow 1.0.3 specification.

## Manifest Contents

- \`workflow.yaml\` — Complete workflow specification
${aiManifestBullets}
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
${aiSection}`;

  return {
    workflowName,
    workflowYaml: specYaml,
    dockerfile,
    kubernetesYaml,
    readmeMd,
    aiSubflows,
  };
}
