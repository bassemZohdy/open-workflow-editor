import { Handle, Position } from '@xyflow/react';
import { taskColors, taskSubtitles, paletteItems } from '../../taskMeta';

function WorkflowNode({ data, selected }) {
  const color = taskColors[data.taskType] || 'blue';
  return (
    <div
      className={`workflow-node ${color} ${selected ? 'selected' : ''}`}
      role="group"
      aria-label={`${data.taskType} task ${data.label}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-accent" />
      <div className="node-icon">{paletteItems.find((item) => item.type === data.taskType)?.icon || '◇'}</div>
      <div className="node-content">
        <strong>{data.label}</strong>
        <span>{taskSubtitles[data.taskType] || data.taskType}</span>
      </div>
      <span className="node-menu">···</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export { WorkflowNode };
