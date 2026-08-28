import { describe, bench } from 'vitest';
import { parseWorkflow, createFlowGraph } from './workflowModel';

function generateLargeWorkflowYaml(taskCount: number): string {
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    tasks.push(`  - task${i}:\n      type: set\n      set:\n        key: key${i}\n        value: value${i}`);
  }
  return `workflow: "1.0.0"\nname: large-workflow\ndo:\n${tasks.join('\n')}`;
}

describe('Performance benchmarks', () => {
  bench(
    'parseWorkflow with 100 tasks',
    () => {
      parseWorkflow(generateLargeWorkflowYaml(100));
    },
    { iterations: 50 },
  );

  bench(
    'parseWorkflow with 500 tasks',
    () => {
      parseWorkflow(generateLargeWorkflowYaml(500));
    },
    { iterations: 20 },
  );

  bench(
    'createFlowGraph with 100 tasks',
    () => {
      const parsed = parseWorkflow(generateLargeWorkflowYaml(100));
      createFlowGraph(parsed.document);
    },
    { iterations: 50 },
  );

  bench(
    'createFlowGraph with 500 tasks',
    () => {
      const parsed = parseWorkflow(generateLargeWorkflowYaml(500));
      createFlowGraph(parsed.document);
    },
    { iterations: 20 },
  );
});
