import { describe, it, expect } from 'vitest';
import * as yaml from 'js-yaml';
import { AI_COMPONENTS, aiComponents, getAiComponent, findAiComponentBySubflow } from './registry';
import { createAiSubflowDocument, addTopLevelAiTask, parseWorkflow } from '../workflowModel';

describe('AI component registry', () => {
  it('exports exactly 4 components', () => {
    expect(AI_COMPONENTS).toHaveLength(4);
    expect(aiComponents()).toHaveLength(4);
  });

  it('every component has unique kind, subflow target, and taskName', () => {
    const kinds = AI_COMPONENTS.map((c) => c.kind);
    const targets = AI_COMPONENTS.map((c) => `${c.subflowNamespace}/${c.subflowName}`);
    const taskNames = AI_COMPONENTS.map((c) => c.taskName);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(targets).size).toBe(targets.length);
    expect(new Set(taskNames).size).toBe(taskNames.length);
  });

  it('every component has required fields populated', () => {
    for (const c of AI_COMPONENTS) {
      expect(c.kind).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(c.taskName).toBeTruthy();
      expect(c.subflowNamespace).toBe('ai');
      expect(c.subflowName).toBeTruthy();
      expect(c.subflowVersion).toBeTruthy();
      expect(c.catalog.catalogKey).toBeTruthy();
      expect(c.catalog.endpoint).toBeTruthy();
      expect(c.script).toBeTruthy();
      expect(c.invokeName).toBeTruthy();
      expect(c.resultKey).toBeTruthy();
      expect(c.resultPath).toBeTruthy();
      expect(c.mock.sourceKeys.length).toBeGreaterThan(0);
      expect(c.mock.resultKey).toBeTruthy();
      expect(c.mock.prefix).toBeTruthy();
      expect(c.mock.maxEchoLength).toBeGreaterThan(0);
      expect(c.mock.logLabel).toBeTruthy();
    }
  });

  it('getAiComponent returns each component by kind', () => {
    for (const c of AI_COMPONENTS) {
      expect(getAiComponent(c.kind)).toBe(c);
    }
  });

  it('getAiComponent throws for unknown kind', () => {
    expect(() => getAiComponent('nonexistent' as any)).toThrow('Unknown AI component kind');
  });

  it('findAiComponentBySubflow matches by namespace+name', () => {
    for (const c of AI_COMPONENTS) {
      expect(findAiComponentBySubflow(c.subflowNamespace, c.subflowName)).toBe(c);
    }
  });

  it('findAiComponentBySubflow returns undefined for unknown targets', () => {
    expect(findAiComponentBySubflow('ai', 'nonexistent')).toBeUndefined();
    expect(findAiComponentBySubflow('other', 'prompt-llm')).toBeUndefined();
    expect(findAiComponentBySubflow(undefined, undefined)).toBeUndefined();
  });
});

describe('AI component sub-flow documents', () => {
  for (const component of AI_COMPONENTS) {
    it(`${component.kind} scaffolded document is schema-valid`, () => {
      const doc = createAiSubflowDocument(component.kind);
      const yamlStr = yaml.dump(doc);
      expect(() => parseWorkflow(yamlStr)).not.toThrow();
    });

    it(`${component.kind} document has correct metadata`, () => {
      const doc = createAiSubflowDocument(component.kind);
      expect(doc.document?.namespace).toBe(component.subflowNamespace);
      expect(doc.document?.name).toBe(component.subflowName);
      expect(doc.document?.version).toBe(component.subflowVersion);
      expect((doc.document?.metadata as any)?.kind).toBe(component.kind);
    });

    it(`${component.kind} document declares the correct catalog`, () => {
      const doc = createAiSubflowDocument(component.kind);
      expect(doc.use?.catalogs).toHaveProperty(component.catalog.catalogKey);
      expect((doc.use?.catalogs as any)?.[component.catalog.catalogKey]?.endpoint).toBe(
        component.catalog.endpoint,
      );
    });

    it(`${component.kind} document has invoke + captureResult tasks`, () => {
      const doc = createAiSubflowDocument(component.kind);
      expect(doc.do).toHaveLength(2);
      const invokeTask = doc.do![0];
      expect(invokeTask).toHaveProperty(component.invokeName);
      const captureTask = doc.do![1];
      expect(captureTask).toHaveProperty('captureResult');
    });
  }
});

describe('AI delegation tasks', () => {
  for (const component of AI_COMPONENTS) {
    it(`${component.kind} delegation task is schema-valid`, () => {
      const base = createAiSubflowDocument(component.kind);
      const withDelegation = addTopLevelAiTask(base, component.kind);
      const yamlStr = yaml.dump(withDelegation);
      expect(() => parseWorkflow(yamlStr)).not.toThrow();
    });

    it(`${component.kind} delegation creates a run.workflow task`, () => {
      const base = createAiSubflowDocument(component.kind);
      const withDelegation = addTopLevelAiTask(base, component.kind);
      const lastTask = withDelegation.do![withDelegation.do!.length - 1];
      const taskBody = (lastTask as any)[component.taskName];
      expect(taskBody).toBeDefined();
      expect(taskBody.run.workflow.namespace).toBe(component.subflowNamespace);
      expect(taskBody.run.workflow.name).toBe(component.subflowName);
      expect(taskBody.run.workflow.version).toBe(component.subflowVersion);
    });
  }
});

describe('AI component mock recipes', () => {
  for (const component of AI_COMPONENTS) {
    it(`${component.kind} mock produces the expected result key`, () => {
      const { mock } = component;
      const source = 'test input text';
      const extras = mock.extraOutput?.(source, {}) ?? {};
      const output = {
        ...extras,
        [mock.resultKey]: `${mock.prefix} ${source.slice(0, mock.maxEchoLength)}`,
      };
      expect(output).toHaveProperty(mock.resultKey);
      expect((output as any)[mock.resultKey]).toContain(mock.prefix);
    });
  }
});
