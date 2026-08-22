import { Handle, Position } from '@xyflow/react';
import type { FlowNodeData } from '../../types';

export interface PortNodeProps {
  data: FlowNodeData;
}

export function PortNode({ data }: PortNodeProps) {
  const isStart = data.portType === 'start';
  return (
    <div className={`port-node ${isStart ? 'start' : 'end'}`}>
      {isStart && <Handle type="source" position={Position.Bottom} />}
      {!isStart && <Handle type="target" position={Position.Top} />}
      <span>{isStart ? '▶' : '■'}</span>
      <strong>{data.label}</strong>
    </div>
  );
}
