import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

export interface LibraryWorkflowRow {
  id: string;
  name: string;
  isActive: boolean;
  isDirty: boolean;
  /** True when the workflow exists in the saved library (not just an open tab). */
  isSaved: boolean;
}

interface LibraryExplorerProps {
  workflows: LibraryWorkflowRow[];
  onOpen: (id: string) => void;
  onRename: (id: string, nextName: string) => void;
  onDelete: (id: string) => void;
  onReorderWorkflows?: (draggedId: string, overId: string) => void;
  /** Increment to scroll the active row back into view (reveal-active command). */
  revealRequestId?: number;
}

function LibraryRow({
  workflow,
  onOpen,
  onRename,
  onDelete,
  onReorderWorkflows,
}: {
  workflow: LibraryWorkflowRow;
  onOpen: (id: string) => void;
  onRename: (id: string, nextName: string) => void;
  onDelete: (id: string) => void;
  onReorderWorkflows?: (draggedId: string, overId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workflow.name);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== workflow.name) onRename(workflow.id, next);
    else setDraft(workflow.name);
  };

  const startEditing = () => {
    setDraft(workflow.name);
    setEditing(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') {
      setDraft(workflow.name);
      setEditing(false);
    }
  };

  const beginDrag = (event: DragEvent<HTMLDivElement>) => {
    if (!onReorderWorkflows) return;
    event.dataTransfer.setData('application/open-workflow-library', workflow.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onReorderWorkflows) return;
    if (!event.dataTransfer.types.includes('application/open-workflow-library')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onReorderWorkflows) return;
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('application/open-workflow-library');
    setDropTarget(false);
    if (draggedId && draggedId !== workflow.id) onReorderWorkflows(draggedId, workflow.id);
  };

  return (
    <div
      className={`library-item ${workflow.isActive ? 'active' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`}
      title={workflow.name}
      role="option"
      aria-selected={workflow.isActive}
      draggable={Boolean(onReorderWorkflows)}
      onClick={() => onOpen(workflow.id)}
      onDragStart={beginDrag}
      onDragEnd={() => setDragging(false)}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropTarget(false)}
      onDrop={handleDrop}
    >
      <span className="library-icon">{workflow.isSaved ? '⬡' : '✎'}</span>
      {editing ? (
        <input
          className="library-rename-input"
          value={draft}
          aria-label={`Rename workflow ${workflow.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <span
          className="library-name"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
        >
          {workflow.name}
        </span>
      )}
      {workflow.isDirty && <span className="document-tab-dirty-dot" />}
      <span className="library-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="library-action"
          aria-label={`Rename ${workflow.name}`}
          title="Rename workflow"
          onClick={startEditing}
        >
          ✎
        </button>
        {!workflow.isActive && (
          <button
            type="button"
            className="library-action danger"
            aria-label={`Delete ${workflow.name}`}
            title="Delete workflow"
            onClick={() => onDelete(workflow.id)}
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * VS Code Explorer analog: a compact saved-workflows list with open / rename /
 * delete, drag-to-reorder, and a dirty indicator for unsaved tabs. Rows keep
 * the order provided by the parent (which persists manual reordering); the
 * active row auto-scrolls into view and responds to a reveal command.
 */
export function LibraryExplorer({
  workflows,
  onOpen,
  onRename,
  onDelete,
  onReorderWorkflows,
  revealRequestId = 0,
}: LibraryExplorerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => workflows, [workflows]);
  const activeId = workflows.find((workflow) => workflow.isActive)?.id ?? null;
  const prevActiveRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeId !== prevActiveRef.current) {
      prevActiveRef.current = activeId;
      listRef.current?.querySelector('.library-item.active')?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeId]);

  useEffect(() => {
    if (revealRequestId > 0) {
      listRef.current
        ?.querySelector('.library-item.active')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [revealRequestId]);

  return (
    <div className="library-list" role="listbox" aria-label="Saved workflows" ref={listRef}>
      {rows.length === 0 && <div className="library-empty">No saved workflows yet</div>}
      {rows.map((workflow) => (
        <LibraryRow
          key={workflow.id}
          workflow={workflow}
          onOpen={onOpen}
          onRename={onRename}
          onDelete={onDelete}
          onReorderWorkflows={onReorderWorkflows}
        />
      ))}
    </div>
  );
}
