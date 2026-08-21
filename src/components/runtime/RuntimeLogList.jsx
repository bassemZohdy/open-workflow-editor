import { useMemo, useEffect, useState } from 'react';
import { parseRuntimeLogs } from '../../runtimeStatus';

function RuntimeLogList({ logs }) {
  const entries = useMemo(() => parseRuntimeLogs(logs), [logs]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded(new Set(entries.length ? [entries.length - 1] : []));
  }, [entries.length, logs]);

  const toggleEntry = (index, open) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const setAllExpanded = (open) => {
    setExpanded(open ? new Set(entries.map((_, index) => index)) : new Set());
  };

  return (
    <div className="runtime-log-list" aria-label="Workflow run logs">
      <div className="runtime-log-actions">
        <button type="button" className="log-action" onClick={() => setAllExpanded(true)}>
          Expand all
        </button>
        <button type="button" className="log-action" onClick={() => setAllExpanded(false)}>
          Collapse all
        </button>
      </div>
      <div className="runtime-log-entries">
        {entries.map((entry, index) => (
          <details
            className="runtime-log-entry"
            key={entry.id}
            open={expanded.has(index)}
            onToggle={(event) => toggleEntry(index, event.currentTarget.open)}
          >
            <summary>
              <i aria-hidden="true" />
              <time>{entry.timestamp ? entry.timestamp.slice(11, 19) : '—'}</time>
              <strong>{entry.summary}</strong>
              <span aria-hidden="true">{expanded.has(index) ? '⌃' : '⌄'}</span>
            </summary>
            <div className="runtime-log-detail">
              {entry.detail && <p>{entry.detail}</p>}
              <code>{entry.raw}</code>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export { RuntimeLogList };
