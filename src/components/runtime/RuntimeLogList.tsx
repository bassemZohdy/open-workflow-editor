import { useMemo, useEffect, useState, type SyntheticEvent } from 'react';
import { parseRuntimeLogs } from '../../runtimeStatus';

export interface RuntimeLogListProps {
  logs: string;
}

type LogLevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR';

export function RuntimeLogList({ logs }: RuntimeLogListProps) {
  const entries = useMemo(() => parseRuntimeLogs(logs), [logs]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('ALL');
  const [copyNotice, setCopyNotice] = useState('');

  useEffect(() => {
    setExpanded(new Set(entries.length ? [entries.length - 1] : []));
  }, [entries.length, logs]);

  const levelCounts = useMemo(() => {
    let info = 0;
    let warn = 0;
    let error = 0;
    entries.forEach((e) => {
      const upper = (e.summary + ' ' + e.raw).toUpperCase();
      if (upper.includes('ERROR') || upper.includes('FAILED')) error++;
      else if (upper.includes('WARN')) warn++;
      else info++;
    });
    return { info, warn, error, total: entries.length };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const upper = (entry.summary + ' ' + (entry.detail || '') + ' ' + entry.raw).toUpperCase();

      if (levelFilter === 'INFO' && (upper.includes('WARN') || upper.includes('ERROR'))) return false;
      if (levelFilter === 'WARN' && !upper.includes('WARN')) return false;
      if (levelFilter === 'ERROR' && !upper.includes('ERROR') && !upper.includes('FAILED')) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matches =
          entry.summary.toLowerCase().includes(query) ||
          entry.detail?.toLowerCase().includes(query) ||
          entry.raw.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [entries, searchQuery, levelFilter]);

  const toggleEntry = (index: number, open: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const setAllExpanded = (open: boolean) => {
    setExpanded(open ? new Set(entries.map((_, index) => index)) : new Set());
  };

  const handleCopyLogs = async () => {
    const text = filteredEntries.map((e) => e.raw).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice('Copied');
      window.setTimeout(() => setCopyNotice(''), 2000);
    } catch {
      setCopyNotice('Failed');
      window.setTimeout(() => setCopyNotice(''), 2000);
    }
  };

  return (
    <div className="runtime-log-list" aria-label="Workflow run logs">
      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Filter logs…"
            aria-label="Filter logs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              height: 24,
              padding: '0 8px',
              fontSize: 11,
              borderRadius: 4,
              border: '1px solid var(--line)',
              background: 'var(--bg-surface)',
              color: 'var(--ink)',
            }}
          />
          <button type="button" className="log-action" onClick={handleCopyLogs} title="Copy filtered logs">
            {copyNotice || 'Copy'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 3 }}>
            {(
              [
                { key: 'ALL', label: `All (${levelCounts.total})` },
                { key: 'INFO', label: `Info (${levelCounts.info})` },
                { key: 'WARN', label: `Warn (${levelCounts.warn})` },
                { key: 'ERROR', label: `Err (${levelCounts.error})` },
              ] as Array<{ key: LogLevelFilter; label: string }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setLevelFilter(item.key)}
                style={{
                  padding: '2px 6px',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: levelFilter === item.key ? 700 : 500,
                  background: levelFilter === item.key ? 'var(--blue)' : 'var(--bg-surface-soft)',
                  color: levelFilter === item.key ? '#fff' : 'var(--muted)',
                  border: '1px solid',
                  borderColor: levelFilter === item.key ? 'var(--blue)' : 'var(--line)',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="log-action"
              style={{ fontSize: 9, padding: '1px 4px' }}
              onClick={() => setAllExpanded(true)}
              aria-label="Expand all"
            >
              Expand all
            </button>
            <button
              type="button"
              className="log-action"
              style={{ fontSize: 9, padding: '1px 4px' }}
              onClick={() => setAllExpanded(false)}
              aria-label="Collapse all"
            >
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <div className="runtime-log-entries">
        {filteredEntries.length === 0 ? (
          <div style={{ padding: '12px 8px', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
            No logs match filter
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <details
              className="runtime-log-entry"
              key={entry.id}
              open={expanded.has(index)}
              onToggle={(event: SyntheticEvent<HTMLDetailsElement>) =>
                toggleEntry(index, event.currentTarget.open)
              }
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
          ))
        )}
      </div>
    </div>
  );
}
