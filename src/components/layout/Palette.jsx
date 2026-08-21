import { paletteItems } from '../../taskMeta';

function Palette({ onNewWorkflow, onAddTask, collapsed = false, onToggle }) {
  const beginDrag = (event, type) => {
    event.dataTransfer.setData('application/open-workflow-task', type);
    event.dataTransfer.effectAllowed = 'move';
  };

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
        <span className="collapsed-rail-label">Task palette</span>
      </aside>
    );
  }

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
          <button
            className="new-workflow"
            onClick={onNewWorkflow}
            aria-label="Create new workflow"
            title="Create new workflow"
          >
            ＋
          </button>
        </div>
      </div>
      <div className="rail-section">
        <div className="section-heading">
          <strong>Task palette</strong>
          <span>Drag to canvas</span>
        </div>
        <div className="palette-list">
          {paletteItems.map((item) => (
            <div
              key={item.type}
              className={`palette-item ${item.color}`}
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Add ${item.label} task`}
              onDragStart={(event) => beginDrag(event, item.type)}
              onKeyDown={(event) => {
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
              <b>⠿</b>
            </div>
          ))}
        </div>
        <div className="palette-note">
          <span>✦</span>
          <p>More task types are coming. Start with the core building blocks.</p>
        </div>
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

export { Palette };
