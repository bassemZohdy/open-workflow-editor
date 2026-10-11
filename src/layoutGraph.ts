import type { ElkNode } from 'elkjs/lib/elk-api';
import type { FlowGraph } from './types';
import layoutOptions from '../scripts/elk/profile.json';

/** The single layout profile used by every editor graph. */
export function createLayoutGraph(flow: FlowGraph): ElkNode {
  return {
    id: 'workflow-layout',
    children: flow.nodes.map((node) => ({
      id: node.id,
      width: node.type === 'port' ? 83 : 208,
      height: node.type === 'port' ? 42 : 74,
    })),
    edges: flow.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    layoutOptions: { ...layoutOptions },
  };
}
