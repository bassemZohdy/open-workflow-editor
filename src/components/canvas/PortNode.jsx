import { Handle, Position } from '@xyflow/react';

function PortNode({ data }) {
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

export { PortNode };
