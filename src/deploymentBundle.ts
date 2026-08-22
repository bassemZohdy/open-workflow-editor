export interface DeploymentBundle {
  workflowName: string;
  workflowYaml: string;
  dockerfile: string;
  kubernetesYaml: string;
  readmeMd: string;
}

export function generateDeploymentBundle(specYaml: string, workflowName = 'workflow'): DeploymentBundle {
  const safeName =
    (workflowName || 'workflow')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'workflow';

  const indentedSpec = specYaml
    .split('\n')
    .map((line) => (line.trim() ? `    ${line}` : line))
    .join('\n');

  const dockerfile = `# Open Workflow Specification 1.0.3 Production Runtime Container
FROM openworkflow/runtime:1.0.3
LABEL maintainer="Open Workflow Editor"
LABEL org.opencontainers.image.title="${safeName}"

WORKDIR /app
COPY workflow.yaml /app/workflow.yaml
ENV WORKFLOW_SPEC_PATH=/app/workflow.yaml
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
          volumeMounts:
            - name: spec-volume
              mountPath: /app/workflow.yaml
              subPath: workflow.yaml
          resources:
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

  const readmeMd = `# ${workflowName} — Open Workflow Deployment Bundle

This bundle contains production deployment manifests for the **${workflowName}** Open Workflow 1.0.3 specification.

## Manifest Contents

- \`workflow.yaml\` — Complete workflow specification
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
`;

  return {
    workflowName,
    workflowYaml: specYaml,
    dockerfile,
    kubernetesYaml,
    readmeMd,
  };
}
