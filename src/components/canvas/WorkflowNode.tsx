import { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getTaskColor, getTaskIcon, getTaskSubtitle } from '../../taskMeta';
import type { FlowNodeData } from '../../types';

export interface WorkflowNodeProps {
  data: FlowNodeData;
  selected?: boolean;
}

export function WorkflowNode({ data, selected }: WorkflowNodeProps) {
  const color = getTaskColor(data.taskType, data.task as Record<string, unknown>);
  const highlightClass = data.isHighlighted ? 'node-highlighted' : data.isDimmed ? 'node-dimmed' : '';
  const execClass = data.executionStatus ? `exec-${data.executionStatus}` : '';

  const subItems = useMemo(() => {
    const task = data.task as Record<string, unknown> | undefined;
    if (!task) return [];
    if (data.taskType === 'do' && Array.isArray(task.do)) {
      return task.do.map((item) => Object.keys(item || {})[0]).filter(Boolean);
    }
    if (data.taskType === 'for') {
      const forObj = task.for as { each?: string; in?: unknown } | undefined;
      const innerDo = Array.isArray(task.do)
        ? task.do.map((i) => Object.keys(i || {})[0]).filter(Boolean)
        : [];
      const prefix = forObj?.each ? `each: ${forObj.each}` : 'loop';
      return [prefix, ...innerDo.slice(0, 2)];
    }
    if (data.taskType === 'fork') {
      const forkObj = task.fork as { branches?: Array<Record<string, unknown>> } | undefined;
      if (Array.isArray(forkObj?.branches)) {
        return forkObj.branches.map((b) => Object.keys(b || {})[0]).filter(Boolean);
      }
    }
    if (data.taskType === 'try' || data.taskType === 'try-catch') {
      const tryDo = Array.isArray(task.try)
        ? task.try.map((i) => Object.keys(i || {})[0]).filter(Boolean)
        : [];
      const hasCatch = Boolean(task.catch);
      const items = [...tryDo.slice(0, 2)];
      if (hasCatch) items.push('catch');
      return items;
    }
    if (data.taskType === 'switch' && Array.isArray(task.switch)) {
      return task.switch.map((c) => Object.keys(c || {})[0]).filter(Boolean);
    }
    return [];
  }, [data.task, data.taskType]);

  return (
    <div
      className={`workflow-node ${color} ${selected ? 'selected' : ''} ${highlightClass} ${execClass}`.trim()}
      role="group"
      aria-label={`${data.taskType} task ${data.label}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-accent" />
      <div className="node-icon">
        {data.executionStatus === 'running'
          ? '⏳'
          : data.executionStatus === 'success'
            ? '✓'
            : data.executionStatus === 'failed'
              ? '✗'
              : getTaskIcon(data.taskType, data.task as Record<string, unknown>)}
      </div>
      <div className="node-content">
        <strong>{data.label}</strong>
        <span>{getTaskSubtitle(data.taskType, data.task as Record<string, unknown>)}</span>
        {subItems.length > 0 && (
          <div className="node-subitems">
            {subItems.slice(0, 3).map((item, idx) => (
              <span key={idx} className="node-subpill">
                {item}
              </span>
            ))}
            {subItems.length > 3 && <span className="node-subpill count">+{subItems.length - 3}</span>}
          </div>
        )}
      </div>
      <span className="node-menu">···</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
