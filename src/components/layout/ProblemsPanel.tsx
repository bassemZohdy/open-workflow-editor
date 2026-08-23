import { useMemo, type ReactNode } from 'react';

export interface ProblemItem {
  id: string;
  message: string;
  path: string;
  severity: 'error' | 'warning' | 'info';
  kind: 'task' | 'schema' | 'graph' | 'subflow';
  /** Line (0-based) when the problem can be located inside the specification. */
  line?: number;
  onSelect: () => void;
}

interface ProblemsPanelProps {
  open: boolean;
  onToggle: () => void;
  items: ProblemItem[];
  onClear?: () => void;
  /** When true the panel is rendered in the workspace (bottom dock). */
  docked?: boolean;
}

export function ProblemsPanel({ open, onToggle, items, onClear, docked = true }: ProblemsPanelProps) {
  const grouped = useMemo(() => {
    const byKind: Record<string, ProblemItem[]> = {};
    items.forEach((item) => {
      const key = item.kind;
      if (!byKind[key]) byKind[key] = [];
      byKind[key].push(item);
    });
    return byKind;
  }, [items]);

  const errors = items.filter((i) => i.severity === 'error').length;
  const warnings = items.filter((i) => i.severity === 'warning').length;

  const renderList = (kindItems: ProblemItem[], label: string, labelIcon: string): ReactNode => (
    <div className="problems-group" key={label}>
      <div className="problems-group-head">
        <span>{labelIcon}</span>
        <strong>{label}</strong>
        <span className="problems-count">{kindItems.length}</span>
      </div>
      {kindItems.map((item) => (
        <button
          type="button"
          className={`problems-item problems-${item.severity} ${open ? 'expanded' : ''}`}
          key={item.id}
          onClick={() => {
            item.onSelect();
            if (!open) onToggle();
          }}
          title={`${item.path}${typeof item.line === 'number' ? ` (line ${item.line + 1})` : ''} — click to navigate`}
        >
          <span className="problems-severity" aria-hidden="true">
            {item.severity === 'error' ? '✕' : item.severity === 'warning' ? '!' : '·'}
          </span>
          <span className="problems-message">{item.message}</span>
          <span className="problems-path">{item.path}</span>
        </button>
      ))}
    </div>
  );

  return (
    <section className={`problems-panel ${open ? 'open' : 'collapsed'}`} aria-label="Problems panel">
      {open ? (
        <div className="problems-content">
          <div className="problems-head">
            <span className="problems-head-title">
              <strong>Problems</strong>
              <span className={`problems-badge errors`}>{errors}</span>
              <span className="problems-badge warnings">{warnings}</span>
            </span>
            <span className="tab-spacer" />
            {onClear && (
              <button className="button secondary problems-clear" onClick={onClear}>
                Clear
              </button>
            )}
            <button
              className={`button secondary icon-action ${docked ? '' : ''}`}
              onClick={onToggle}
              title={open ? 'Collapse problems panel' : 'Show problems panel'}
              aria-label={open ? 'Collapse problems panel' : 'Show problems panel'}
            >
              {open ? '⌄' : '⌃'}
            </button>
          </div>
          <div className="problems-list">
            {items.length === 0 ? (
              <div className="problems-empty">No problems detected — the workflow is valid.</div>
            ) : (
              Object.values(grouped).map((kindItems) => {
                const first = kindItems[0];
                const label =
                  first.kind === 'schema'
                    ? 'Schema'
                    : first.kind === 'graph'
                      ? 'Graph'
                      : first.kind === 'subflow'
                        ? 'Sub-flow references'
                        : 'Task';
                const icon =
                  first.kind === 'schema'
                    ? 'ƒ?'
                    : first.kind === 'graph'
                      ? '⌬'
                      : first.kind === 'subflow'
                        ? '⇄'
                        : '·';
                return renderList(kindItems, label, icon);
              })
            )}
          </div>
        </div>
      ) : (
        <div
          className="problems-collapsed-bar"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          aria-label="Open problems panel"
        >
          <strong className="problems-collapsed-title">
            <i className="problems-collapsed-icon" />
            Problems
          </strong>
          <span className={`problems-badge errors`}>{errors}</span>
          <span className="problems-badge warnings">{warnings}</span>
          <span className="tab-spacer" />
          <span className="problems-collapsed-hint">Click to expand</span>
        </div>
      )}
    </section>
  );
}
