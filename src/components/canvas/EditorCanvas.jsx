import { useState, useEffect, useCallback } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import {
  addTopLevelTask,
  connectTopLevelTasks,
  disconnectTopLevelTasks,
  removeTopLevelTask,
} from '../../workflowModel';
import { paletteItems } from '../../taskMeta';
import { WorkflowNode } from './WorkflowNode';
import { PortNode } from './PortNode';

const nodeTypes = { task: WorkflowNode, port: PortNode };

function EditorCanvas({
  document,
  nodes,
  setNodes,
  edges,
  setEdges,
  setPositions,
  setDirty,
  onDocumentChange,
  onPositionChange,
  setSelectedId,
  selectedId,
  layoutMode,
  onUndo,
  onRedo,
  onSave,
  onDuplicateSelected,
  layoutKey,
}) {
  const reactFlow = useReactFlow();
  const [dropStatus, setDropStatus] = useState('idle');

  useEffect(() => {
    if (!nodes.length) return undefined;
    const frame = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.2, duration: 0 });
    });
    const timer = window.setTimeout(() => {
      reactFlow.fitView({ padding: 0.18, duration: 0 });
    }, 140);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [layoutKey, nodes.length, reactFlow]);

  const onNodesChange = useCallback(
    (changes) => {
      const moved = changes.filter((change) => change.type === 'position' && change.position);
      if (moved.length) {
        setDirty(true);
        setPositions((current) => {
          const next = { ...current };
          moved.forEach((change) => {
            next[change.id] = change.position;
          });
          return next;
        });
      }
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [setNodes, setPositions],
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
    [setEdges],
  );

  const onConnect = useCallback(
    (connection) => {
      const next = connectTopLevelTasks(document, connection.source, connection.target);
      if (next !== document) onDocumentChange(next);
    },
    [document, onDocumentChange],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges) => {
      deletedEdges.forEach((edge) => {
        const next = disconnectTopLevelTasks(document, edge.source, edge.target);
        if (next !== document) onDocumentChange(next);
      });
    },
    [document, onDocumentChange],
  );

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      const taskNodes = deletedNodes.filter((node) => node.type === 'task');
      if (!taskNodes.length) return;
      let next = document;
      taskNodes.forEach((node) => {
        next = removeTopLevelTask(next, node.id);
      });
      onDocumentChange(next);
      setSelectedId(null);
    },
    [document, onDocumentChange, setSelectedId],
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDropStatus('idle');
      const taskType = event.dataTransfer.getData('application/open-workflow-task');
      if (!taskType || !paletteItems.some((item) => item.type === taskType)) {
        setDropStatus('invalid');
        window.setTimeout(() => setDropStatus('idle'), 1200);
        return;
      }
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const next = addTopLevelTask(document, taskType);
      const createdName = Object.keys(next.do[next.do.length - 1])[0];
      onDocumentChange(next, { [`/do/${createdName}`]: position });
    },
    [document, onDocumentChange, reactFlow],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const modifier = event.metaKey || event.ctrlKey;
      if (isTyping && !(modifier && event.key.toLowerCase() === 's')) return;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? onRedo() : onUndo();
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      } else if (modifier && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        onDuplicateSelected();
      } else if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const taskNodes = nodes.filter((node) => node.type === 'task');
        setNodes((current) => current.map((node) => ({ ...node, selected: node.type === 'task' })));
        setSelectedId(taskNodes[0]?.id || null);
      } else if (!modifier && (event.key === 'Delete' || event.key === 'Backspace')) {
        const selectedNodes = nodes.filter((node) => node.type === 'task' && node.selected);
        if (selectedNodes.length) {
          event.preventDefault();
          reactFlow.deleteElements({ nodes: selectedNodes });
        }
      } else if (!modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        reactFlow.fitView({ padding: 0.18, duration: 240 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, onDuplicateSelected, onRedo, onSave, onUndo, reactFlow, selectedId, setNodes, setSelectedId]);

  return (
    <div
      className={`canvas-shell ${dropStatus !== 'idle' ? 'drag-over' : ''}`}
      onDrop={onDrop}
      onDragEnter={(event) => {
        setDropStatus(
          event.dataTransfer.types.includes('application/open-workflow-task') ? 'valid' : 'invalid',
        );
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget))
          setDropStatus('idle');
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const valid = event.dataTransfer.types.includes('application/open-workflow-task');
        event.dataTransfer.dropEffect = valid ? 'move' : 'none';
        setDropStatus(valid ? 'valid' : 'invalid');
      }}
    >
      {dropStatus !== 'idle' && (
        <div className={`drop-target ${dropStatus}`}>
          <strong>{dropStatus === 'valid' ? 'Drop task here' : 'Unsupported drop'}</strong>
          <span>
            {dropStatus === 'valid' ? 'Release to add it to the workflow' : 'Use a task from the palette'}
          </span>
        </div>
      )}
      {nodes.length <= 2 && (
        <div className="canvas-empty">
          <span className="empty-mark">＋</span>
          <strong>Drop a task here</strong>
          <p>Drag a task from the palette to start building this workflow.</p>
        </div>
      )}
      <details className="canvas-legend">
        <summary>Legend</summary>
        <div className="legend-items">
          {paletteItems.map((item) => (
            <span key={item.type} className={`legend-item ${item.color}`}>
              <i>{item.icon}</i>
              {item.label}
            </span>
          ))}
          <span className="legend-item state">
            <i className="legend-selected" />
            selected
          </span>
        </div>
      </details>
      <ReactFlow
        key={layoutKey}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => onPositionChange(node.id, node.position)}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onNodeClick={(_, node) => setSelectedId(node.type === 'task' ? node.id : null)}
        onPaneClick={() => setSelectedId(null)}
        deleteKeyCode="Delete"
        selectionOnDrag
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesConnectable
        nodesDraggable={layoutMode === 'manual'}
        elementsSelectable
        panOnDrag
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#c9d1dc" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) =>
            node.type === 'port' ? '#98a4b7' : node.data?.taskType === 'call' ? '#9370df' : '#4c83e7'
          }
          maskColor="#f8fafccc"
        />
      </ReactFlow>
    </div>
  );
}

export { EditorCanvas, nodeTypes };
