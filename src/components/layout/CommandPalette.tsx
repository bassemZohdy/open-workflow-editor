import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyMatch, type FuzzyResult } from '../../fuzzy';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  section: string;
  icon?: string;
  keywords?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

function HighlightedLabel({ label, positions }: { label: string; positions: number[] }) {
  const set = new Set(positions);
  return (
    <>
      {label.split('').map((char, index) =>
        set.has(index) ? (
          <mark key={`${char}-${index}`} className="palette-mark">
            {char}
          </mark>
        ) : (
          <span key={`${char}-${index}`}>{char}</span>
        ),
      )}
    </>
  );
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedSectionRef = useRef<string>('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    selectedSectionRef.current = '';
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const results = useMemo(() => {
    if (!commands.length) return [];
    const items: Array<{ command: PaletteCommand; result: FuzzyResult }> = [];
    commands.forEach((command) => {
      const haystack = `${command.label} ${command.keywords || ''} ${command.section}`;
      const match = fuzzyMatch(query, haystack);
      if (match) items.push({ command, result: match });
    });
    items.sort((a, b) => b.result.score - a.result.score);
    return items;
  }, [commands, query]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  // Keep the active section header in view and fix highlight indexes relative to labels.
  const sectioned = useMemo(() => {
    const entries: Array<{
      key: string;
      kind: 'header' | 'command';
      section?: string;
      command?: PaletteCommand;
      positions?: number[];
    }> = [];
    let lastSection = '';
    results.forEach(({ command, result }, index) => {
      if (command.section !== lastSection) {
        lastSection = command.section;
        entries.push({ key: `header-${index}`, kind: 'header', section: command.section });
      }
      entries.push({ key: `item-${command.id}`, kind: 'command', command, positions: result.positions });
    });
    return entries;
  }, [results]);

  useEffect(() => {
    const active = results[activeIndex]?.command;
    const section = active ? active.section : '';
    if (section && section !== selectedSectionRef.current) {
      selectedSectionRef.current = section;
      listRef.current
        ?.querySelector(`[data-section-name="${CSS.escape(section)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
    listRef.current
      ?.querySelectorAll('[data-command-index]')
      [activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  if (!open) return null;

  const runCommand = (command: PaletteCommand | undefined) => {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };

  return (
    <div className="palette-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="palette-dialog"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          <span className="palette-prompt">›</span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="Type a command or search…"
            aria-label="Command palette search"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runCommand(results[activeIndex]?.command);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Tab') {
                e.preventDefault();
                setActiveIndex((i) =>
                  e.shiftKey ? Math.max(0, i - 1) : Math.min(i + 1, Math.max(0, results.length - 1)),
                );
              }
            }}
          />
          <span className="palette-cancel">Esc</span>
        </div>
        <div className="palette-list" ref={listRef} role="listbox" key={query}>
          {sectioned.length === 0 && <div className="palette-empty">No matching commands</div>}
          {sectioned.map((entry) => {
            if (entry.kind === 'header') {
              return (
                <div className="palette-section" data-section-name={entry.section} key={entry.key}>
                  {entry.section}
                </div>
              );
            }
            const command = entry.command!;
            const commandIndex = results.findIndex((r) => r.command.id === command.id);
            return (
              <button
                type="button"
                role="option"
                aria-selected={commandIndex === activeIndex}
                data-command-index={commandIndex}
                key={entry.key}
                className={`palette-command ${commandIndex === activeIndex ? 'active' : ''} ${command.danger ? 'danger' : ''}`}
                disabled={command.disabled}
                onClick={() => runCommand(command)}
                onMouseEnter={() => setActiveIndex(commandIndex)}
              >
                <span className="palette-command-icon">{command.icon || '·'}</span>
                <span className="palette-command-label">
                  <HighlightedLabel label={command.label} positions={entry.positions || []} />
                </span>
                {command.hint && <span className="palette-command-hint">{command.hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>
            <i>↑↓</i> navigate
          </span>
          <span>
            <i>↵</i> run
          </span>
          <span>
            <i>esc</i> dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
