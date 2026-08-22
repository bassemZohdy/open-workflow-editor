import { useState, useMemo, useRef, useEffect } from 'react';

export function isValidExpression(text?: unknown): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed.startsWith('${') || !trimmed.endsWith('}')) return true; // plain text is valid
  const inner = trimmed.slice(2, -1).trim();
  return inner.length > 0;
}

export interface ExpressionInputProps {
  label: string;
  value?: string;
  placeholder?: string;
  onChange: (nextValue: string) => void;
  onBlur?: (val?: string) => void;
  suggestions?: string[];
  ariaLabel?: string;
}

export function ExpressionInput({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
  suggestions = ['$context', '$input', '$catalogs'],
  ariaLabel,
}: ExpressionInputProps) {
  const [showHelpers, setShowHelpers] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const valid = isValidExpression(value);

  const activeSuggestions = useMemo(() => {
    const text = String(value || '').trim();
    if (!text.startsWith('${')) return suggestions;
    const query = text
      .replace(/^\$\{\s*/, '')
      .replace(/\s*\}?$/, '')
      .toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(query));
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    window.document.addEventListener('mousedown', handleClickOutside);
    return () => window.document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const insertSuggestion = (suggestion: string) => {
    const expr = `\${ ${suggestion} }`;
    onChange(expr);
    if (onBlur) onBlur(expr);
    setShowHelpers(false);
    setShowDropdown(false);
  };

  const handleInputChange = (next: string) => {
    onChange(next);
    if (next.includes('${') && !next.endsWith('}')) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  return (
    <div className="field expression-field" ref={containerRef} style={{ position: 'relative' }}>
      <div className="expression-field-head">
        <span>{label}</span>
        <button
          type="button"
          className="expression-suggest-toggle"
          onClick={() => setShowHelpers((curr) => !curr)}
          title="Toggle expression helpers"
          aria-label="Toggle expression helpers"
        >
          {showHelpers ? 'Hide helpers' : '＋ Helpers'}
        </button>
      </div>
      <input
        aria-label={ariaLabel || label}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (value?.includes('${') && !value.endsWith('}')) setShowDropdown(true);
        }}
        onBlur={(e) => {
          onBlur?.(e.target.value);
        }}
        className={!valid ? 'input-invalid' : ''}
        spellCheck="false"
      />
      {showDropdown && activeSuggestions.length > 0 && (
        <div className="expression-suggestions-popup" role="listbox" aria-label="Expression autocomplete">
          {activeSuggestions.map((s) => (
            <div
              key={s}
              role="option"
              aria-selected="false"
              tabIndex={0}
              className="expression-suggestion-item"
              onClick={() => insertSuggestion(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') insertSuggestion(s);
              }}
            >
              <span>{`\${ ${s} }`}</span>
              <span className="expression-suggestion-category">
                {s.startsWith('$context') ? 'context' : s.startsWith('$input') ? 'input' : 'expr'}
              </span>
            </div>
          ))}
        </div>
      )}
      {showHelpers && (
        <div className="expression-suggestions" role="group" aria-label="Expression suggestions">
          <span className="suggestion-label">Available variables:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" className="expression-pill" onClick={() => insertSuggestion(s)}>
              {`\${ ${s} }`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
