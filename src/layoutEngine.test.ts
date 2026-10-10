import { describe, expect, it } from 'vitest';
import FullELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { createLayoutEngine } from './layoutEngine';
import { createLayoutGraph } from './layoutGraph';
import { COMPLEX_WORKFLOW } from './fixtures/complexWorkflow';
import { WORKFLOW_TEMPLATES } from './fixtures/templates';
import {
  autoLayoutFlow,
  createFlowGraph,
  NEW_WORKFLOW,
  parseWorkflow,
  SMART_CITY_WORKFLOWS,
} from './workflowModel';

const profiles = [
  { id: 'empty', specification: NEW_WORKFLOW },
  { id: 'nested-branching', specification: COMPLEX_WORKFLOW },
  ...SMART_CITY_WORKFLOWS,
  ...WORKFLOW_TEMPLATES,
];

// GWT adds process-local identity hashes; compare every actual graph/layout field.
const layoutData = (graph: ElkNode): ElkNode =>
  JSON.parse(JSON.stringify(graph, (key, value) => (key === '$H' ? undefined : value)));

describe('compiled ELK layout parity', () => {
  it('rejects changed options instead of silently ignoring them', async () => {
    const graph = createLayoutGraph(createFlowGraph(parseWorkflow(NEW_WORKFLOW).document));
    graph.layoutOptions!['elk.direction'] = 'RIGHT';
    await expect(createLayoutEngine().layout(graph)).rejects.toThrow(/profile mismatch/);
  });
  for (const { id, specification } of profiles) {
    it(`matches upstream coordinates and edge routing for ${id}`, async () => {
      const document = parseWorkflow(specification).document;
      const graph = createLayoutGraph(createFlowGraph(document));
      const full = new FullELK({ algorithms: ['layered'] });
      const reduced = createLayoutEngine();
      const expected = await full.layout(structuredClone(graph));
      const actual = await reduced.layout(structuredClone(graph));
      expect(layoutData(actual)).toEqual(layoutData(expected));
      expect(await autoLayoutFlow(document)).toEqual(
        Object.fromEntries(expected.children!.map((node) => [node.id, { x: node.x, y: node.y }])),
      );
    });
  }

  const cases: [string, ElkNode][] = [
    [
      'cycle and self-loop',
      {
        id: 'cycle',
        children: ['a', 'b', 'c'].map((id) => ({ id, width: 208, height: 74 })),
        edges: [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
          ['b', 'b'],
        ].map(([source, target], index) => ({
          id: `e${index}`,
          sources: [source],
          targets: [target],
        })),
      },
    ],
    [
      'ports and disconnected nodes',
      {
        id: 'ports',
        children: [
          { id: 'a', width: 208, height: 74, ports: [{ id: 'a-out', width: 8, height: 8 }] },
          { id: 'b', width: 208, height: 74, ports: [{ id: 'b-in', width: 8, height: 8 }] },
          { id: 'isolated', width: 83, height: 42 },
        ],
        edges: [{ id: 'port-edge', sources: ['a-out'], targets: ['b-in'] }],
      },
    ],
    [
      'fork and join',
      {
        id: 'fork',
        children: ['entry', 'fork', 'left', 'middle', 'right', 'join', 'exit'].map((id) => ({
          id,
          width: id === 'entry' || id === 'exit' ? 83 : 208,
          height: 74,
        })),
        edges: [
          ['entry', 'fork'],
          ['fork', 'left'],
          ['fork', 'middle'],
          ['fork', 'right'],
          ['left', 'join'],
          ['middle', 'join'],
          ['right', 'join'],
          ['join', 'exit'],
        ].map(([source, target], index) => ({
          id: `e${index}`,
          sources: [source],
          targets: [target],
        })),
      },
    ],
  ];
  for (const [name, input] of cases) {
    it(`matches upstream for ${name}`, async () => {
      const layoutOptions = createLayoutGraph({ nodes: [], edges: [] }).layoutOptions;
      const graph = { ...input, layoutOptions };
      const full = new FullELK({ algorithms: ['layered'] });
      const reduced = createLayoutEngine();
      expect(layoutData(await reduced.layout(structuredClone(graph)))).toEqual(
        layoutData(await full.layout(structuredClone(graph))),
      );
    });
  }

  for (let seed = 1; seed <= 20; seed++) {
    it(`matches upstream for generated branching, cyclic and disconnected graph ${seed}`, async () => {
      let state = seed;
      const random = (limit: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % limit;
      };
      const count = 4 + seed;
      const children = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        width: i % 3 === 0 ? 83 : 208,
        height: i % 3 === 0 ? 42 : 74,
      }));
      const edges = Array.from({ length: count * 2 }, (_, i) => ({
        id: `e${i}`,
        sources: [`n${random(count - 1)}`],
        targets: [`n${random(count - 1)}`],
      }));
      const graph = {
        id: `generated-${seed}`,
        children,
        edges,
        layoutOptions: createLayoutGraph({ nodes: [], edges: [] }).layoutOptions,
      };
      const full = new FullELK({ algorithms: ['layered'] });
      expect(layoutData(await createLayoutEngine().layout(structuredClone(graph)))).toEqual(
        layoutData(await full.layout(structuredClone(graph))),
      );
    });
  }
});
