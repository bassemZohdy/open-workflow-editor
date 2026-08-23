import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { WORKFLOW_TEMPLATES } from './fixtures/templates';
import {
  generateDeploymentBundle,
  sanitizeSubflowSegment,
  subflowKey,
  type SubflowTarget,
} from './deploymentBundle';
import type { WorkflowDocument } from './types';

/**
 * Tasks 58+63: Kubernetes ConfigMap keys must match [-._a-zA-Z0-9]+ —
 * `kubectl apply` rejects any key containing `/` or other characters.
 */
const K8S_KEY_PATTERN = /^[-._a-zA-Z0-9]+$/;

const parseManifests = (yamlText: string) =>
  yaml.loadAll(yamlText) as Array<Record<string, unknown> & { kind?: string }>;

type DeploymentManifest = {
  spec: {
    template: {
      spec: {
        containers: Array<{
          env: Array<{ name: string; value: string }>;
          volumeMounts: Array<{ subPath: string; mountPath: string }>;
        }>;
        volumes: Array<{ configMap: { items: Array<{ key: string; path: string }> } }>;
      };
    };
  };
};

const PARENT_SPEC = `document:
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
`;

const billingDocument: WorkflowDocument = {
  document: { dsl: '1.0.3', namespace: 'billing', name: 'billing-process', version: '0.1.0' },
  do: [{ initSubflow: { set: { subflowReady: true } } }],
};

const subflowPath = (target: SubflowTarget): string =>
  `subflows/${sanitizeSubflowSegment(target.namespace)}/${sanitizeSubflowSegment(target.name)}.yaml`;

describe('deployment bundle sub-flow keys (Tasks 58+63)', () => {
  it('emits ConfigMap data keys and items[].key within the Kubernetes charset', () => {
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === 'ai-orchestration');
    expect(template).toBeDefined();
    const bundle = generateDeploymentBundle(template!.specification, 'ai-orchestration');
    expect(bundle.subflows.length).toBeGreaterThan(0);

    const manifests = parseManifests(bundle.kubernetesYaml);
    const configMap = manifests[0];
    const dataKeys = Object.keys((configMap.data as Record<string, unknown>) || {});
    expect(dataKeys).toContain('workflow.yaml');
    expect(dataKeys).toHaveLength(bundle.subflows.length + 1);
    for (const key of dataKeys) {
      expect(key).toMatch(K8S_KEY_PATTERN);
    }

    const deployment = manifests[1] as DeploymentManifest;
    const items = deployment.spec.template.spec.volumes[0].configMap.items;
    expect(items).toHaveLength(bundle.subflows.length + 1);
    for (const item of items) {
      expect(item.key).toMatch(K8S_KEY_PATTERN);
    }
  });

  it('sanitizes hostile namespace/name segments into charset-safe, traversal-free, deterministic keys', () => {
    for (const hostile of ['evil: thing', '../escape', '..', 'a  b/c', '-trim-']) {
      const segment = sanitizeSubflowSegment(hostile);
      expect(segment).toMatch(K8S_KEY_PATTERN);
      expect(segment).not.toContain('..');
      expect(segment.startsWith('-')).toBe(false);
      expect(sanitizeSubflowSegment(hostile)).toBe(segment);
    }

    const key = subflowKey({ namespace: 'evil: thing', name: '../escape' });
    expect(key).toMatch(K8S_KEY_PATTERN);
    expect(key).not.toContain('/');
    expect(key).not.toContain('..');

    // Already-safe segments keep the stable, human-readable key format.
    expect(sanitizeSubflowSegment('billing')).toBe('billing');
    expect(sanitizeSubflowSegment('prompt-llm')).toBe('prompt-llm');
    expect(subflowKey({ namespace: 'ai', name: 'prompt-llm' })).toBe('subflows.ai.prompt-llm.yaml');
  });

  it('never collides two distinct (namespace, name) pairs after sanitization', () => {
    const targets: SubflowTarget[] = [
      { namespace: 'evil: thing', name: 'escape' },
      { namespace: 'evil-thing', name: 'escape' },
      { namespace: 'a:b', name: 'x' },
      { namespace: 'a b', name: 'x' },
      { namespace: 'a-b', name: 'x' },
      { namespace: 'ai', name: 'prompt-llm' },
      { namespace: '..', name: 'subflow' },
    ];
    const keys = targets.map((target) => subflowKey(target));
    expect(new Set(keys).size).toBe(targets.length);
    for (const key of keys) {
      expect(key).toMatch(K8S_KEY_PATTERN);
    }
  });

  it('keeps data keys, volume items, subPaths and mount paths internally consistent', () => {
    const bundle = generateDeploymentBundle(PARENT_SPEC, 'parent-flow', [billingDocument]);
    expect(bundle.subflows).toHaveLength(2);

    const expectedKeys = ['workflow.yaml', ...bundle.subflows.map((artifact) => subflowKey(artifact))];
    const expectedPaths = ['workflow.yaml', ...bundle.subflows.map((artifact) => subflowPath(artifact))];

    const manifests = parseManifests(bundle.kubernetesYaml);
    const configMap = manifests[0];
    expect(Object.keys((configMap.data as Record<string, unknown>) || {}).sort()).toEqual(
      [...expectedKeys].sort(),
    );

    const deployment = manifests[1] as DeploymentManifest;
    const container = deployment.spec.template.spec.containers[0];
    expect(container.volumeMounts.map((mount) => mount.subPath).sort()).toEqual([...expectedPaths].sort());
    bundle.subflows.forEach((artifact) => {
      const path = subflowPath(artifact);
      expect(
        container.volumeMounts.some((mount) => mount.subPath === path && mount.mountPath === `/app/${path}`),
      ).toBe(true);
    });

    const items = deployment.spec.template.spec.volumes[0].configMap.items;
    expect(items.map((item) => item.key).sort()).toEqual([...expectedKeys].sort());
    expect(items.map((item) => item.path).sort()).toEqual([...expectedPaths].sort());
    expect(container.env).toContainEqual({ name: 'WORKFLOW_SUBFLOW_PATH', value: '/app/subflows' });
    expect(bundle.dockerfile).toContain('COPY subflows/ /app/subflows/');
  });

  it('ships the actual sub-flow YAML content under the sanitized keys', () => {
    const bundle = generateDeploymentBundle(PARENT_SPEC, 'parent-flow', [billingDocument]);
    const manifests = parseManifests(bundle.kubernetesYaml);
    const data = (manifests[0].data as Record<string, string>) || {};
    for (const key of Object.keys(data)) {
      expect(key).toMatch(K8S_KEY_PATTERN);
    }

    const billing = bundle.subflows.find((artifact) => artifact.name === 'billing-process')!;
    expect(data[subflowKey(billing)]).toContain('subflowReady: true');

    const llm = bundle.subflows.find((artifact) => artifact.name === 'prompt-llm')!;
    expect(data[subflowKey(llm)]).toContain('ai-providers');
  });
});
