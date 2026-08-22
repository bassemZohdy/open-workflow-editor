import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import {
  addTopLevelTask,
  connectTopLevelTasks,
  disconnectTopLevelTasks,
  removeTopLevelTask,
} from '../../workflowModel';
import { paletteItems } from '../../taskMeta';
import { downloadSvgDiagram, downloadPngDiagram } from '../../diagramExport';
import type { WorkflowDocument, FlowNode, FlowEdge, CanvasPositions, TaskType, AppTheme } from '../../types';
import { WorkflowNode } from './WorkflowNode';
import { PortNode } from './PortNode';
import { CanvasToolbar } from './CanvasToolbar';

export const nodeTypes = { task: WorkflowNode, port: PortNode };

const miniMapColors: Record<string, string> = {
  set: '#2563eb',
  call: '#7c3aed',
  switch: '#d97706',
  do: '#059669',
  for: '#0d9488',
  fork: '#0284c7',
  emit: '#c026d3',
  listen: '#4f46e5',
  raise: '#dc2626',
  run: '#ea580c',
  try: '#4338ca',
  'try-catch': '#4338ca',
  catch: '#4338ca',
  wait: '#475569',
};

export interface EditorCanvasProps {
  document: WorkflowDocument;
  nodes: FlowNode[];
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  edges: FlowEdge[];
  setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>;
  setPositions: React.Dispatch<React.SetStateAction<CanvasPositions>>;
  setDirty: (dirty: boolean) => void;
  onDocumentChange: (nextDoc: WorkflowDocument, positions?: CanvasPositions) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  setSelectedId: (id: string | null) => void;
  selectedId: string | null;
  layoutMode: 'auto' | 'manual';
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDuplicateSelected: () => void;
  layoutKey: string | number;
  executionStatusMap?: Record<string, 'running' | 'success' | 'failed' | 'waiting'>;
  theme?: AppTheme;
  onOpenFileContent?: (content: string, filename: string) => void;
  /** External search request (from workspace-wide search); filters nodes when set. */
  externalSearch?: { term: string; requestId: number } | null;
  /** Incrementing counter that triggers a fit-view when it changes. */
  fitViewRequest?: number;
  /** Incrementing counter that triggers zoom in / out / reset when it changes. */
  zoomRequest?: { direction: 'in' | 'out' | 'reset'; requestId: number } | null;
  /** Workflow id used to restore a per-workflow persisted viewport. */
  workflowId?: string;
  /** Restored viewport for the current workflow (applied on mount). */
  initialViewport?: { x: number; y: number; zoom: number } | null;
  /** Reports viewport changes (pan/zoom) for persistence. */
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  /** Toggles the mini-map. */
  showMiniMap?: boolean;
  onNodeContextMenu?: (node: FlowNode, x: number, y: number) => void;
  onPaneContextMenu?: (x: number, y: number) => void;
  /** Layout actions surfaced in the canvas toolbar. */
  onAutoLayout?: () => void;
  isLayouting?: boolean;
  onToggleLayoutMode?: () => void;
}

export function EditorCanvas({
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
  executionStatusMap,
  theme = 'light',
  onOpenFileContent,
  externalSearch,
  fitViewRequest,
  zoomRequest,
  workflowId,
  initialViewport,
  onViewportChange,
  showMiniMap = true,
  onNodeContextMenu,
  onPaneContextMenu,
  onAutoLayout,
  isLayouting = false,
  onToggleLayoutMode,
}: EditorCanvasProps) {
  const reactFlow = useReactFlow();
  const [dropStatus, setDropStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const restoredViewportRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!externalSearch) return;
    setSearchTerm(externalSearch.term);
  }, [externalSearch?.requestId, externalSearch?.term]);

  useEffect(() => {
    if (!fitViewRequest) return;
    reactFlow.fitView({ padding: 0.18, duration: 240 });
  }, [fitViewRequest, reactFlow]);

  useEffect(() => {
    if (!zoomRequest) return;
    if (zoomRequest.direction === 'in') reactFlow.zoomIn({ duration: 160 });
    else if (zoomRequest.direction === 'out') reactFlow.zoomOut({ duration: 160 });
    else reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest?.requestId, reactFlow]);

  // Restore the per-workflow viewport once when the workflow changes; otherwise
  // fall back to fit-view (see the layoutKey effect below).
  useEffect(() => {
    if (!initialViewport || restoredViewportRef.current === workflowId) return;
    restoredViewportRef.current = workflowId;
    const frame = window.requestAnimationFrame(() => {
      reactFlow.setViewport(initialViewport);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workflowId, initialViewport, reactFlow]);

  useEffect(() => {
    if (!nodes.length) return undefined;
    if (initialViewport && restoredViewportRef.current === workflowId) return undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, nodes.length, reactFlow]);

  const processedNodes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const isFiltering = term.length > 0 || filterType !== 'all';

    return nodes.map((node) => {
      const taskKey = node.id.startsWith('/do/') ? node.id.slice('/do/'.length) : node.id;
      const execStatus = executionStatusMap
        ? executionStatusMap[node.id] || executionStatusMap[taskKey]
        : undefined;

      if (node.type === 'port') {
        return {
          ...node,
          data: {
            ...node.data,
            executionStatus: execStatus,
            isDimmed: isFiltering,
            isHighlighted: false,
          },
        };
      }
      const label = String(node.data?.label || '').toLowerCase();
      const taskType = String(node.data?.taskType || '').toLowerCase();
      const matchesSearch = !term || label.includes(term) || taskType.includes(term);
      const matchesType = filterType === 'all' || taskType === filterType;
      const isMatch = matchesSearch && matchesType;

      return {
        ...node,
        data: {
          ...node.data,
          executionStatus: execStatus,
          isHighlighted: isFiltering && isMatch,
          isDimmed: isFiltering && !isMatch,
        },
      };
    });
  }, [nodes, searchTerm, filterType, executionStatusMap]);

  const matchCount = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term && filterType === 'all') return nodes.filter((n) => n.type === 'task').length;
    return nodes.filter((node) => {
      if (node.type === 'port') return false;
      const label = String(node.data?.label || '').toLowerCase();
      const taskType = String(node.data?.taskType || '').toLowerCase();
      const matchesSearch = !term || label.includes(term) || taskType.includes(term);
      const matchesType = filterType === 'all' || taskType === filterType;
      return matchesSearch && matchesType;
    }).length;
  }, [nodes, searchTerm, filterType]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const moved = changes.filter(
        (change) => change.type === 'position' && 'position' in change && Boolean(change.position),
      ) as Array<{ id: string; position: { x: number; y: number } }>;
      if (moved.length) {
        setDirty(true);
        setPositions((current) => {
          const next = { ...current };
          moved.forEach((change) => {
            if (change.position) {
              next[change.id] = change.position;
            }
          });
          return next;
        });
      }
      setNodes((current) => applyNodeChanges(changes as never, current as never) as FlowNode[]);
    },
    [setDirty, setNodes, setPositions],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const next = connectTopLevelTasks(document, connection.source, connection.target);
      if (next !== document) onDocumentChange(next);
    },
    [document, onDocumentChange],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: FlowEdge[]) => {
      deletedEdges.forEach((edge) => {
        const next = disconnectTopLevelTasks(document, edge.source, edge.target);
        if (next !== document) onDocumentChange(next);
      });
    },
    [document, onDocumentChange],
  );

  const onNodesDelete = useCallback(
    (deletedNodes: FlowNode[]) => {
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
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropStatus('idle');

      // Check if dropped item is a file
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.name.endsWith('.yaml') || file.name.endsWith('.yml') || file.name.endsWith('.json')) {
          file.text().then((text) => {
            onOpenFileContent?.(text, file.name);
          });
          return;
        }
      }

      const taskType = event.dataTransfer.getData('application/open-workflow-task') as TaskType;
      if (!taskType || !paletteItems.some((item) => item.type === taskType && !item.comingSoon)) {
        setDropStatus('invalid');
        window.setTimeout(() => setDropStatus('idle'), 1200);
        return;
      }
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const next = addTopLevelTask(document, taskType);
      const createdName = Object.keys(next.do?.[next.do.length - 1] || {})[0];
      onDocumentChange(next, { [`/do/${createdName}`]: position });
    },
    [document, onDocumentChange, onOpenFileContent, reactFlow],
  );

  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.18, duration: 240 });
  }, [reactFlow]);

  const handleExportSvg = useCallback(() => {
    const filename = document.document?.name || 'workflow-diagram';
    downloadSvgDiagram({ nodes, edges }, filename);
  }, [document.document?.name, edges, nodes]);

  const handleExportPng = useCallback(async () => {
    const filename = document.document?.name || 'workflow-diagram';
    await downloadPngDiagram({ nodes, edges }, filename);
  }, [document.document?.name, edges, nodes]);

  const selectedNodes = useMemo(() => {
    return nodes.filter(
      (node) =>
        node.type === 'task' &&
        ((node as unknown as { selected?: boolean }).selected || node.id === selectedId),
    );
  }, [nodes, selectedId]);

  const handleAlign = useCallback(
    (type: 'left' | 'center' | 'top' | 'distribute-v' | 'distribute-h') => {
      const targets = selectedNodes.length >= 2 ? selectedNodes : nodes.filter((n) => n.type === 'task');
      if (targets.length < 2) return;

      const nextPositions: CanvasPositions = {};
      if (type === 'left') {
        const minX = Math.min(...targets.map((n) => n.position.x));
        targets.forEach((n) => {
          nextPositions[n.id] = { x: minX, y: n.position.y };
        });
      } else if (type === 'center') {
        const avgX = Math.round(targets.reduce((sum, n) => sum + n.position.x, 0) / targets.length);
        targets.forEach((n) => {
          nextPositions[n.id] = { x: avgX, y: n.position.y };
        });
      } else if (type === 'top') {
        const minY = Math.min(...targets.map((n) => n.position.y));
        targets.forEach((n) => {
          nextPositions[n.id] = { x: n.position.x, y: minY };
        });
      } else if (type === 'distribute-v') {
        const sorted = [...targets].sort((a, b) => a.position.y - b.position.y);
        const minY = sorted[0].position.y;
        const maxY = sorted[sorted.length - 1].position.y;
        const step = (maxY - minY) / (sorted.length - 1);
        sorted.forEach((n, i) => {
          nextPositions[n.id] = { x: n.position.x, y: Math.round(minY + i * step) };
        });
      }

      setDirty(true);
      setPositions((current) => ({ ...current, ...nextPositions }));
      setNodes((current) =>
        current.map((n) => (nextPositions[n.id] ? { ...n, position: nextPositions[n.id] } : n)),
      );
    },
    [nodes, selectedNodes, setDirty, setNodes, setPositions],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const modifier = event.metaKey || event.ctrlKey;
      if (isTyping && !(modifier && event.key.toLowerCase() === 's')) return;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
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
        const selectedNodes = nodes.filter(
          (node) => node.type === 'task' && (node as unknown as { selected?: boolean }).selected,
        );
        if (selectedNodes.length) {
          event.preventDefault();
          reactFlow.deleteElements({ nodes: selectedNodes as never });
        }
      } else if (!modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        handleFitView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleFitView,
    nodes,
    onDuplicateSelected,
    onRedo,
    onSave,
    onUndo,
    reactFlow,
    selectedId,
    setNodes,
    setSelectedId,
  ]);

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
        if (
          event.currentTarget === event.target ||
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setDropStatus('idle');
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const valid = event.dataTransfer.types.includes('application/open-workflow-task');
        event.dataTransfer.dropEffect = valid ? 'move' : 'none';
        setDropStatus(valid ? 'valid' : 'invalid');
      }}
    >
      <CanvasToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        matchCount={matchCount}
        onFitView={handleFitView}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onAlign={handleAlign}
        selectedCount={selectedNodes.length}
        onAutoLayout={onAutoLayout}
        isLayouting={isLayouting}
        layoutMode={layoutMode}
        onToggleLayoutMode={onToggleLayoutMode}
      />
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
          {paletteItems
            .filter((item) => !item.comingSoon)
            .map((item) => (
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
        nodes={processedNodes as never}
        edges={edges as never}
        nodeTypes={nodeTypes as never}
        onNodesChange={onNodesChange as never}
        onNodeDragStop={(_, node) => onPositionChange(node.id, node.position)}
        onEdgesChange={onEdgesChange as never}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete as never}
        onNodesDelete={onNodesDelete as never}
        onNodeClick={(_, node) => setSelectedId(node.type === 'task' ? node.id : null)}
        onNodeContextMenu={(event, node) => {
          if (node.type !== 'task') return;
          event.preventDefault();
          onNodeContextMenu?.(node as unknown as FlowNode, event.clientX, event.clientY);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          onPaneContextMenu?.(event.clientX, event.clientY);
        }}
        onPaneClick={() => setSelectedId(null)}
        onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}
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
        colorMode={theme === 'dark' || theme === 'high-contrast' ? 'dark' : 'light'}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color={theme === 'dark' ? '#374151' : theme === 'high-contrast' ? '#ffffff' : '#c9d1dc'}
          gap={20}
          size={1}
        />
        <Controls showInteractive={false} />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) =>
              node.type === 'port'
                ? '#98a4b7'
                : miniMapColors[(node.data as { taskType?: string })?.taskType || ''] || '#4c83e7'
            }
            maskColor={theme === 'dark' ? '#111827cc' : theme === 'high-contrast' ? '#000000cc' : '#f8fafccc'}
          />
        )}
      </ReactFlow>
    </div>
  );
}
