import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { PALETTE_GROUPS, paletteItems, type PaletteItem } from '../../taskMeta';
import type { TaskType } from '../../types';
import { LibraryExplorer, type LibraryWorkflowRow } from './LibraryExplorer';

export interface PaletteProps {
  onNewWorkflow: () => void;
  onAddTask: (type: TaskType) => void;
  collapsed?: boolean;
  onToggle: () => void;
  libraryWorkflows?: LibraryWorkflowRow[];
  onOpenWorkflow?: (id: string) => void;
  onRenameWorkflow?: (id: string, nextName: string) => void;
  onDeleteWorkflow?: (id: string) => void;
  /** Accordion section state (left rail). */
  libraryExpanded?: boolean;
  paletteExpanded?: boolean;
  onToggleLibrary?: () => void;
  onTogglePalette?: () => void;
  /** Accordion state per palette group (only present groups are stored). */
  paletteGroupsExpanded?: Record<string, boolean>;
  onTogglePaletteGroup?: (group: string) => void;
}

function RailSection({
  title,
  count,
  expanded,
  onToggle,
  actions,
  variant = 'section',
  children,
}: {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  variant?: 'section' | 'group';
  children: ReactNode;
}) {
  const bodyId = `rail-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className={`rail-section accordion-${variant}`}>
      <div className={`accordion-head-row ${expanded ? 'open' : ''}`}>
        <button
          type="button"
          className="accordion-head"
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={expanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={onToggle}
        >
          <span className="accordion-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <strong className="accordion-title">{title}</strong>
          {typeof count === 'number' && <span className="accordion-meta">{count}</span>}
        </button>
        {actions && <div className="accordion-head-actions">{actions}</div>}
      </div>
      {expanded && (
        <div className="accordion-body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
}

function PaletteItemRow({ item, onAddTask }: { item: PaletteItem; onAddTask: (type: TaskType) => void }) {
  const beginDrag = (event: DragEvent<HTMLDivElement>) => {
    if (item.comingSoon) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/open-workflow-task', item.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      key={item.type}
      className={`palette-item ${item.color} ${item.comingSoon ? 'coming-soon' : ''}`}
      draggable={!item.comingSoon}
      role="button"
      aria-disabled={item.comingSoon || undefined}
      tabIndex={item.comingSoon ? -1 : 0}
      aria-label={`${item.comingSoon ? 'Coming soon: ' : 'Add '}${item.label} task`}
      title={item.comingSoon ? `${item.label} — planned: ${item.plan || 'coming soon'}` : undefined}
      onDragStart={beginDrag}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onAddTask(item.type);
        }
      }}
    >
      <span className="palette-icon">{item.icon}</span>
      <span>
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      {item.comingSoon ? <b className="palette-soon">soon</b> : <b>⠿</b>}
    </div>
  );
}

export function Palette({
  onNewWorkflow,
  onAddTask,
  collapsed = false,
  onToggle,
  libraryWorkflows = [],
  onOpenWorkflow,
  onRenameWorkflow,
  onDeleteWorkflow,
  libraryExpanded = true,
  paletteExpanded = true,
  onToggleLibrary,
  onTogglePalette,
  paletteGroupsExpanded = {},
  onTogglePaletteGroup,
}: PaletteProps) {
  if (collapsed) {
    return (
      <aside className="left-rail left-rail-collapsed" aria-label="Collapsed task palette">
        <button
          className="rail-expand-button"
          onClick={onToggle}
          aria-label="Expand task palette"
          title="Expand task palette"
        >
          ›
        </button>
        <span className="collapsed-rail-label" role="img" aria-label="Task palette" title="Task palette">
          ▦
        </span>
      </aside>
    );
  }

  const availableCount = paletteItems.filter((item) => !item.comingSoon).length;

  return (
    <aside className="left-rail" aria-label="Task palette">
      <div className="rail-header">
        <div>
          <span className="section-kicker">Build</span>
          <h1>
            Open Workflow <span>Editor</span>
          </h1>
        </div>
        <div className="rail-header-actions">
          <button
            className="rail-collapse-button"
            onClick={onToggle}
            aria-label="Collapse task palette"
            title="Collapse task palette"
          >
            ‹
          </button>
        </div>
      </div>
      <div className="rail-scroll">
        {onOpenWorkflow && (
          <RailSection
            title="Workflows"
            count={libraryWorkflows.length}
            expanded={libraryExpanded}
            onToggle={onToggleLibrary || (() => undefined)}
            actions={
              <button
                type="button"
                className="library-new"
                aria-label="Create new workflow"
                title="Create new workflow"
                onClick={onNewWorkflow}
              >
                ＋
              </button>
            }
          >
            <LibraryExplorer
              workflows={libraryWorkflows}
              onOpen={onOpenWorkflow}
              onRename={onRenameWorkflow || (() => undefined)}
              onDelete={onDeleteWorkflow || (() => undefined)}
            />
          </RailSection>
        )}
        <RailSection
          title="Task palette"
          count={availableCount}
          expanded={paletteExpanded}
          onToggle={onTogglePalette || (() => undefined)}
        >
          <div className="palette-list">
            {PALETTE_GROUPS.map((group) => {
              const groupItems = paletteItems.filter((item) => item.group === group);
              if (!groupItems.length) return null;
              const groupCount = groupItems.filter((item) => !item.comingSoon).length;
              return (
                <RailSection
                  key={group}
                  title={group}
                  count={groupCount}
                  variant="group"
                  expanded={paletteGroupsExpanded[group] !== false}
                  onToggle={() => onTogglePaletteGroup?.(group)}
                >
                  {groupItems.map((item) => (
                    <PaletteItemRow key={item.type} item={item} onAddTask={onAddTask} />
                  ))}
                </RailSection>
              );
            })}
          </div>
          <div className="palette-note">
            <span>✦</span>
            <p>More task types are coming. Start with the core building blocks.</p>
          </div>
        </RailSection>
      </div>
      <div className="rail-footer">
        <span className="status-led" />
        Open Workflow DSL <strong>1.0.3</strong>
        <span className="rail-spacer" />
        <span className="version">local</span>
      </div>
    </aside>
  );
}
