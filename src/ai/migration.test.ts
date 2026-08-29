import { describe, it, expect } from 'vitest';
import { collectMigratableDelegations, migrateAiDelegations } from './migration';
import { createAiSubflowDocument, addTopLevelAiTask } from '../workflowModel';
import type { WorkflowDocument } from '../types';

describe('collectMigratableDelegations', () => {
  it('finds AI delegations in a document', () => {
    const base = createAiSubflowDocument('llm-call');
    const doc = addTopLevelAiTask(base, 'llm-call');
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('llm-call');
    expect(result[0].target).toContain('ai/prompt-llm');
  });

  it('finds multiple delegations', () => {
    let doc: WorkflowDocument = createAiSubflowDocument('llm-call');
    doc = addTopLevelAiTask(doc, 'llm-call');
    doc = addTopLevelAiTask(doc, 'ai-agent-call');
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.kind).sort()).toEqual(['ai-agent-call', 'llm-call']);
  });

  it('ignores non-AI delegations', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [
        {
          myTask: {
            run: {
              workflow: { namespace: 'other', name: 'some-flow', version: '1.0.0' },
            },
          },
        },
      ],
    };
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(0);
  });

  it('returns empty for documents with no delegations', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [{ mySet: { set: { value: 42 } } }],
    };
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(0);
  });

  it('finds delegations nested inside try/catch blocks (Task 121)', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [
        {
          myTry: {
            try: [
              {
                aiLlmTask: {
                  run: {
                    workflow: { namespace: 'ai', name: 'prompt-llm', version: '0.1.0' },
                  },
                },
              },
            ],
          },
        },
      ],
    };
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('llm-call');
  });

  it('finds delegations nested inside fork branches', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [
        {
          myFork: {
            fork: {
              branches: [
                {
                  branchA: {
                    do: [
                      {
                        aiAgentTask: {
                          run: {
                            workflow: { namespace: 'ai', name: 'ai-agent', version: '0.1.0' },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    };
    const result = collectMigratableDelegations(doc);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('ai-agent-call');
  });
});

describe('migrateAiDelegations', () => {
  it('returns document unchanged when nativeKeyMap is empty (no-op)', () => {
    let doc: WorkflowDocument = createAiSubflowDocument('llm-call');
    doc = addTopLevelAiTask(doc, 'llm-call');
    const { document: result, migrations } = migrateAiDelegations(doc);
    expect(migrations).toHaveLength(0);
    expect(result).toBe(doc); // same reference (no clone needed)
  });

  it('rewrites delegations when nativeKeyMap is provided', () => {
    let doc: WorkflowDocument = createAiSubflowDocument('llm-call');
    doc = addTopLevelAiTask(doc, 'llm-call');
    const { document: result, migrations } = migrateAiDelegations(doc, { 'llm-call': 'llm' });
    expect(migrations).toHaveLength(1);
    expect(migrations[0].kind).toBe('llm-call');
    // The delegation task should now use the native key.
    const lastTask = result.do![result.do!.length - 1];
    expect(lastTask).toHaveProperty('llm');
    expect(lastTask).not.toHaveProperty('aiLlmTask');
  });

  it('preserves then chain after migration', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [
        {
          aiLlmTask: {
            run: {
              workflow: { namespace: 'ai', name: 'prompt-llm', version: '0.1.0' },
            },
            then: 'nextTask',
          },
        },
        {
          nextTask: { set: { done: true } },
        },
      ],
    };
    const { document: result, migrations } = migrateAiDelegations(doc, { 'llm-call': 'llm' });
    expect(migrations).toHaveLength(1);
    const migratedTask = result.do![0];
    expect((migratedTask as any).llm.then).toBe('nextTask');
  });

  it('preserves all task fields on migration (Task 119)', () => {
    const doc: WorkflowDocument = {
      document: { dsl: '1.0.3', namespace: 'test', name: 'test', version: '1.0.0' },
      do: [
        {
          aiLlmTask: {
            run: {
              workflow: { namespace: 'ai', name: 'prompt-llm', version: '0.1.0' },
            },
            then: 'nextTask',
            if: '${ $context.ready }',
            input: { prompt: '${ $context.text }' },
            timeout: '30s',
            metadata: { priority: 'high' },
          },
        },
        {
          nextTask: { set: { done: true } },
        },
      ],
    };
    const { document: result } = migrateAiDelegations(doc, { 'llm-call': 'llm' });
    const migrated = (result.do![0] as any).llm;
    expect(migrated.then).toBe('nextTask');
    expect(migrated.if).toBe('${ $context.ready }');
    expect(migrated.input).toEqual({ prompt: '${ $context.text }' });
    expect(migrated.timeout).toBe('30s');
    expect(migrated.metadata).toEqual({ priority: 'high' });
    // run should be gone.
    expect(migrated.run).toBeUndefined();
  });

  it('does not mutate the original document', () => {
    let doc: WorkflowDocument = createAiSubflowDocument('llm-call');
    doc = addTopLevelAiTask(doc, 'llm-call');
    const originalLastTask = doc.do![doc.do!.length - 1];
    const originalKeys = Object.keys(originalLastTask);

    migrateAiDelegations(doc, { 'llm-call': 'llm' });

    // Original unchanged.
    expect(Object.keys(doc.do![doc.do!.length - 1])).toEqual(originalKeys);
  });
});
