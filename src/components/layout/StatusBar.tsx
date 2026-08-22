interface StatusBarProps {
  selectedTaskName: string | null;
  problemCount: number;
  warningCount: number;
  cursor: { line: number; column: number } | null;
  format: 'yaml' | 'json';
  workflowName: string;
  saveState: 'saving' | 'saved' | 'error';
  dirty: boolean;
  runtimeHealthy: boolean | null;
  notice: string;
  view: 'canvas' | 'spec';
  onOpenProblems: () => void;
  onOpenPalette: () => void;
}

export function StatusBar({
  selectedTaskName,
  problemCount,
  warningCount,
  cursor,
  format,
  workflowName,
  saveState,
  dirty,
  runtimeHealthy,
  notice,
  view,
  onOpenProblems,
  onOpenPalette,
}: StatusBarProps) {
  const problemsLabel = problemCount + warningCount;
  return (
    <footer className={`app-footer status-bar`}>
      <span className="status-bar-left">
        <i className="status-led" />
        <span className="status-item status-item-ready">Local editor</span>
        <button
          className="status-item status-button"
          onClick={onOpenPalette}
          title="Command palette (Ctrl+Shift+P)"
        >
          ⌘P
        </button>
        <button
          className={`status-item status-button ${problemCount ? 'status-problems-error' : ''}`}
          onClick={onOpenProblems}
          title="Problems panel (Ctrl+Shift+M)"
        >
          <i className="status-problems-icon" /> {problemsLabel > 0 ? `${problemsLabel}` : '0'} problems
        </button>
      </span>
      <span className="status-bar-center">
        <span className="status-item">{workflowName}</span>
        <span className="status-item status-format">{format.toUpperCase()}</span>
        <span className="status-item">
          {selectedTaskName ? `task: ${selectedTaskName}` : view === 'spec' ? 'specification' : 'canvas'}
        </span>
        {view === 'spec' && cursor && (
          <span className="status-item">
            Ln {cursor.line}, Col {cursor.column}
          </span>
        )}
        <span className={`status-item status-save ${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
        </span>
      </span>
      <span className="status-bar-right">
        <span
          className={`status-item status-runtime ${
            runtimeHealthy === true ? 'online' : runtimeHealthy === false ? 'offline' : 'idle'
          }`}
        >
          <i />
          {runtimeHealthy === true
            ? 'Runtime online'
            : runtimeHealthy === false
              ? 'Runtime offline'
              : 'Built-in engine'}
        </span>
        {notice && <span className="status-item status-notice">{notice}</span>}
      </span>
    </footer>
  );
}
