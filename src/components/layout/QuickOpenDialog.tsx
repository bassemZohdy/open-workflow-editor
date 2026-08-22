import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyMatch } from '../../fuzzy';

export interface QuickOpenItem {
  id: string;
  label: string;
  sublabel?: string;
  meta?: string;
  icon?: string;
  dirty?: boolean;
  /** Shortcut to open the item (used by workspace search results too). */
  onSelect: () => void;
}

/** Workspace search result (across saved workflows). */
export interface WorkspaceSearchItem {
  id: string;
  workflowId: string;
  workflowName: string;
  taskName: string;
  taskType: string;
  onOpen: () => void;
}

interface QuickOpenDialogProps {
  open: boolean;
  onClose: () => void;
  items: QuickOpenItem[];
  mode: 'files' | 'search';
  searchResults: WorkspaceSearchItem[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export function QuickOpenDialog({
  open,
  onClose,
  items,
  mode,
  searchResults,
  searchQuery,
  onSearchQueryChange,
}: QuickOpenDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const results = useMemo(() => {
    if (mode === 'search') return [];
    if (!query.trim()) {
      return items.map((item, index) => ({ item, score: items.length - index, positions: [] as number[] }));
    }
    const matched: Array<{ item: QuickOpenItem; score: number; positions: number[] }> = [];
    items.forEach((item) => {
      const match = fuzzyMatch(query, `${item.label} ${item.sublabel || ''}`);
      if (match) matched.push({ item, score: match.score, positions: match.positions });
    });
    matched.sort((a, b) => b.score - a.score);
    return matched;
  }, [items, mode, query]);

  const visibleSearchResults = useMemo(() => {
    if (mode !== 'search' || !searchQuery.trim()) return [];
    const term = searchQuery.trim().toLowerCase();
    return searchResults.filter(
      (r) => r.taskName.toLowerCase().includes(term) || r.taskType.toLowerCase().includes(term),
    );
  }, [mode, searchQuery, searchResults]);

  const total = mode === 'search' ? visibleSearchResults.length : results.length;

  useEffect(() => {
    if (activeIndex >= total) setActiveIndex(Math.max(0, total - 1));
  }, [activeIndex, total]);

  useEffect(() => {
    const active = (mode === 'search' ? visibleSearchResults : results)[activeIndex];
    if (!active) return;
    listRef.current
      ?.querySelectorAll('[data-result-index]')
      [activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, mode, results, visibleSearchResults]);

  if (!open) return null;

  const runCurrent = () => {
    if (mode === 'search') {
      const target = visibleSearchResults[activeIndex];
      if (target) {
        onClose();
        target.onOpen();
      }
      return;
    }
    const target = results[activeIndex];
    if (target) {
      onClose();
      target.item.onSelect();
    }
  };

  return (
    <div className="palette-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="palette-dialog quick-open-dialog"
        role="dialog"
        aria-label={mode === 'search' ? 'Workspace-wide search' : 'Quick open workflow'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          <span className="palette-prompt">{mode === 'search' ? '⌕' : '›'}</span>
          <input
            ref={inputRef}
            className="palette-input"
            value={mode === 'search' ? searchQuery : query}
            placeholder={
              mode === 'search' ? 'Search tasks across all workflows…' : 'Switch workflow by name…'
            }
            aria-label={mode === 'search' ? 'Search tasks across all workflows' : 'Quick open workflow'}
            onChange={(e) => {
              setActiveIndex(0);
              if (mode === 'search') onSearchQueryChange(e.target.value);
              else setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runCurrent();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Tab') {
                e.preventDefault();
                setActiveIndex((i) =>
                  e.shiftKey ? Math.max(0, i - 1) : Math.min(i + 1, Math.max(0, total - 1)),
                );
              }
            }}
          />
          <span className="palette-cancel">Esc</span>
        </div>
        <div
          className="palette-list"
          ref={listRef}
          role="listbox"
          key={`${mode}-${mode === 'search' ? searchQuery : query}`}
        >
          {mode === 'search' ? (
            <>
              {visibleSearchResults.length === 0 && (
                <div className="palette-empty">
                  {searchQuery.trim()
                    ? 'No tasks matched in the workspace'
                    : 'Type to search tasks across all workflows'}
                </div>
              )}
              {visibleSearchResults.map((result, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  data-result-index={index}
                  key={result.id}
                  className={`palette-command ${index === activeIndex ? 'active' : ''}`}
                  onClick={() => {
                    onClose();
                    result.onOpen();
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="palette-command-icon">{result.taskType.slice(0, 1).toUpperCase()}</span>
                  <span className="palette-command-label">
                    {result.taskName}
                    <span className="palette-search-workflow">in {result.workflowName}</span>
                  </span>
                  <span className="palette-command-hint">{result.taskType}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              {results.length === 0 && (
                <div className="palette-empty">
                  {query.trim() ? 'No matching workflows' : 'No open workflows'}
                </div>
              )}
              {results.map(({ item }, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  data-result-index={index}
                  key={item.id}
                  className={`palette-command ${index === activeIndex ? 'active' : ''}`}
                  onClick={() => {
                    onClose();
                    item.onSelect();
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="palette-command-icon">{item.icon || '⬡'}</span>
                  <span className="palette-command-label">
                    {item.label}
                    {item.sublabel && <span className="palette-sublabel">{item.sublabel}</span>}
                  </span>
                  {item.dirty && <span className="palette-dirty-dot" title="Unsaved changes" />}
                  {item.meta && <span className="palette-command-hint">{item.meta}</span>}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="palette-footer">
          <span>
            <i>↑↓</i> navigate
          </span>
          <span>
            <i>↵</i> open
          </span>
          <span>
            <i>esc</i> dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
