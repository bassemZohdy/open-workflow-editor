import { useMemo, useState, type KeyboardEvent } from 'react';

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
}

function LibraryRow({
  workflow,
  onOpen,
  onRename,
  onDelete,
}: {
  workflow: LibraryWorkflowRow;
  onOpen: (id: string) => void;
  onRename: (id: string, nextName: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workflow.name);

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

  return (
    <div
      className={`library-item ${workflow.isActive ? 'active' : ''}`}
      title={workflow.name}
      onClick={() => onOpen(workflow.id)}
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
 * delete and a dirty indicator for unsaved tabs. Sorted alphabetically.
 * Rendered inside the left-rail "Workflows" accordion section (see Palette.tsx).
 */
export function LibraryExplorer({ workflows, onOpen, onRename, onDelete }: LibraryExplorerProps) {
  const rows = useMemo(() => {
    const sorted = [...workflows].sort((a, b) => a.name.localeCompare(b.name));
    const activeFirst = [...sorted].sort((a, b) => Number(b.isActive) - Number(a.isActive));
    return activeFirst;
  }, [workflows]);

  return (
    <div className="library-list" role="listbox" aria-label="Saved workflows">
      {rows.length === 0 && <div className="library-empty">No saved workflows yet</div>}
      {rows.map((workflow) => (
        <LibraryRow
          key={workflow.id}
          workflow={workflow}
          onOpen={onOpen}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
