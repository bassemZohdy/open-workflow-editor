import { useState, type DragEvent, type MouseEvent } from 'react';

export interface DocumentTabItem {
  id: string;
  name: string;
  isDirty?: boolean;
}

export interface DocumentTabsProps {
  tabs: DocumentTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onContextMenu?: (id: string, name: string, x: number, y: number) => void;
  /** Reorders the tab bar when a tab is dragged onto another. */
  onReorderTabs?: (draggedId: string, overId: string) => void;
}

export function DocumentTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenFile,
  onSaveFile,
  onContextMenu,
  onReorderTabs,
}: DocumentTabsProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleClose = (e: MouseEvent, tabId: string) => {
    e.stopPropagation();
    onCloseTab(tabId);
  };

  const handleContextMenu = (e: MouseEvent, tab: DocumentTabItem) => {
    e.preventDefault();
    onContextMenu?.(tab.id, tab.name, e.clientX, e.clientY);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, tabId: string) => {
    e.dataTransfer.setData('application/open-workflow-tab', tabId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(tabId);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, tabId: string) => {
    if (!draggingId || draggingId === tabId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(tabId);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, tabId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/open-workflow-tab') || draggingId;
    if (draggedId && draggedId !== tabId) onReorderTabs?.(draggedId, tabId);
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <div className="document-tabs-bar" role="tablist" aria-label="Open workflow documents">
      <div className="document-tabs-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDropTarget = dropTargetId === tab.id && draggingId !== null && draggingId !== tab.id;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={`document-tab ${isActive ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={() => setDropTargetId((current) => (current === tab.id ? null : current))}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTargetId(null);
              }}
              title={tab.name}
            >
              <span className="document-tab-icon">📄</span>
              <span className="document-tab-title">{tab.name}</span>
              {tab.isDirty && (
                <span
                  className="document-tab-dirty-dot"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="document-tab-close"
                  aria-label={`Close ${tab.name}`}
                  onClick={(e) => handleClose(e, tab.id)}
                  title="Close tab"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="document-tab-add"
          aria-label="New workflow tab"
          onClick={onNewTab}
          title="New workflow (+)"
        >
          ＋
        </button>
      </div>
      <div className="document-tabs-actions">
        {onOpenFile && (
          <button
            type="button"
            className="document-tab-action-btn"
            aria-label="Open local workflow file"
            onClick={onOpenFile}
            title="Open local workflow file (YAML / JSON)"
          >
            📂 Open file
          </button>
        )}
        {onSaveFile && (
          <button
            type="button"
            className="document-tab-action-btn"
            aria-label="Save workflow as local file"
            onClick={onSaveFile}
            title="Save workflow to local file"
          >
            💾 Save file
          </button>
        )}
      </div>
    </div>
  );
}
