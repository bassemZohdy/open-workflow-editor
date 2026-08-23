import { describe, expect, it } from 'vitest';
import { findSubflowDocumentMatch, serializeWorkflow } from './workflowModel';
import type { WorkflowDocument } from './types';
import { generateDeploymentBundle } from './deploymentBundle';

const doc = (namespace: string, name: string, version: string, marker: string): WorkflowDocument =>
  ({
    document: { dsl: '1.0.3', namespace, name, version },
    do: [{ initSubflow: { set: { [marker]: true } } }],
  }) as unknown as WorkflowDocument;

describe('findSubflowDocumentMatch (Task 61: version-aware sub-flow matching)', () => {
  it('prefers the document whose version matches an explicit pin', () => {
    const v1 = doc('payments', 'billing-process', '1.0.0', 'fromV1');
    const v2 = doc('payments', 'billing-process', '2.0.0', 'fromV2');
    // Array order deliberately puts the WRONG version first (the old bug:
    // first ns+name hit won, ignoring the pin).
    const match = findSubflowDocumentMatch([v1, v2], {
      namespace: 'payments',
      name: 'billing-process',
      version: '2.0.0',
    });
    expect(match?.document?.version).toBe('2.0.0');
    expect((match?.do?.[0] as Record<string, never>)?.initSubflow).toBeDefined();
  });

  it('falls back to a namespace+name match when no document carries the pinned version', () => {
    const only = doc('payments', 'billing-process', '1.0.0', 'legacy');
    const match = findSubflowDocumentMatch([only], {
      namespace: 'payments',
      name: 'billing-process',
      version: '9.9.9',
    });
    expect(match?.document?.version).toBe('1.0.0');
  });

  it('ignores version when the target does not pin one', () => {
    const a = doc('dubai-government', 'billing-process', '1.0.0', 'a');
    const b = doc('dubai-government', 'billing-process', '2.0.0', 'b');
    expect(
      findSubflowDocumentMatch([a, b], { namespace: 'dubai-government', name: 'billing-process' })?.document
        ?.version,
    ).toBe('1.0.0');
  });

  it('returns undefined when no document shares namespace+name', () => {
    expect(
      findSubflowDocumentMatch([doc('payments', 'other', '1.0.0', 'x')], {
        namespace: 'payments',
        name: 'billing-process',
        version: '1.0.0',
      }),
    ).toBeUndefined();
  });

  it('deployment bundle ships the pinned version of a duplicated sub-flow name', () => {
    const parent = `document:
  dsl: "1.0.3"
  namespace: "root"
  name: "parent-flow"
  version: "1.0.0"
do:
  - delegate:
      run:
        workflow:
          namespace: payments
          name: billing-process
          version: "2.0.0"
      then: end
`;
    const v1 = serializeWorkflow(doc('payments', 'billing-process', '1.0.0', 'fromV1'), 'yaml');
    const v2 = serializeWorkflow(doc('payments', 'billing-process', '2.0.0', 'fromV2'), 'yaml');
    const bundle = generateDeploymentBundle(parent, 'parent-flow', [
      doc('payments', 'billing-process', '1.0.0', 'fromV1'),
      doc('payments', 'billing-process', '2.0.0', 'fromV2'),
    ]);
    expect(bundle.subflows).toHaveLength(1);
    expect(bundle.subflows[0].version).toBe('2.0.0');
    expect(bundle.kubernetesYaml).toContain('fromV2');
    expect(bundle.kubernetesYaml).not.toContain('fromV1');
    expect(v1).toContain('fromV1'); // sanity: the two serializations really differ
    expect(v2).toContain('fromV2');
  });
});
