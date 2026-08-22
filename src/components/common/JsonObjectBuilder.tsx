import { useEffect, useRef } from 'react';

export type JsonBuilderType =
  'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'time' | 'expression' | 'json' | 'null';

export interface JsonBuilderEntry {
  key: string;
  type: JsonBuilderType;
  value: string;
}

export interface JsonObjectBuilderProps {
  label: string;
  entries: JsonBuilderEntry[];
  onChange: (nextEntries: JsonBuilderEntry[]) => void;
  onCommit: (nextEntries: JsonBuilderEntry[]) => void;
  addLabel?: string;
}

const JSON_BUILDER_TYPES: Array<[JsonBuilderType, string]> = [
  ['string', 'Text'],
  ['number', 'Number'],
  ['boolean', 'True / false'],
  ['date', 'Date'],
  ['datetime', 'Date & time'],
  ['time', 'Time'],
  ['expression', 'Expression'],
  ['json', 'Object / array'],
  ['null', 'Null'],
];

export function inferJsonBuilderType(value: unknown): JsonBuilderType {
  if (value === null) return 'null';
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return 'json';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' && /^\$\{[\s\S]*\}$/.test(value.trim())) return 'expression';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  if (typeof value === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return 'time';
  return 'string';
}

export function normalizeJsonBuilderInput(type: JsonBuilderType, value: unknown): string {
  const text = String(value ?? '');
  if (type === 'datetime' && text.includes('T')) return text.slice(0, 16);
  if (type === 'date' && text.includes('T')) return text.slice(0, 10);
  if (type === 'time' && text.length > 5) return text.slice(0, 5);
  return text;
}

export function objectToJsonBuilderEntries(value: unknown): JsonBuilderEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    type: inferJsonBuilderType(entryValue),
    value:
      entryValue !== null && typeof entryValue === 'object'
        ? JSON.stringify(entryValue, null, 2)
        : entryValue === null
          ? ''
          : String(entryValue),
  }));
}

export function jsonBuilderEntryValue(entry: JsonBuilderEntry): unknown {
  const value = String(entry.value ?? '');
  switch (entry.type) {
    case 'number':
      return value === '' ? 0 : Number(value);
    case 'boolean':
      return value === 'true';
    case 'date':
    case 'datetime':
    case 'time':
    case 'expression':
    case 'string':
      return value;
    case 'json':
      return JSON.parse(value || '{}');
    case 'null':
      return null;
    default:
      return value;
  }
}

export function jsonBuilderEntriesToObject(entries: JsonBuilderEntry[]): Record<string, unknown> {
  return Object.fromEntries(
    entries.map((entry) => [entry.key.trim(), jsonBuilderEntryValue(entry)]).filter(([key]) => key),
  );
}

export function JsonObjectBuilder({
  label,
  entries,
  onChange,
  onCommit,
  addLabel = 'Add property',
}: JsonObjectBuilderProps) {
  const latestEntries = useRef(entries);
  useEffect(() => {
    latestEntries.current = entries;
  }, [entries]);

  const updateEntry = (index: number, field: 'key' | 'value', value: string) => {
    const next = latestEntries.current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [field]: value } : entry,
    );
    latestEntries.current = next;
    onChange(next);
  };

  const changeType = (index: number, type: JsonBuilderType) => {
    const current = latestEntries.current[index];
    const nextValue =
      type === 'boolean'
        ? 'false'
        : type === 'null'
          ? ''
          : normalizeJsonBuilderInput(type, current?.value || '');
    const next: JsonBuilderEntry[] = latestEntries.current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, type, value: nextValue } : entry,
    );
    latestEntries.current = next;
    onChange(next);
    try {
      onCommit(next);
    } catch {
      // Keep the field editable until the value is valid JSON.
    }
  };

  const commit = (nextEntries = latestEntries.current) => {
    try {
      onCommit(nextEntries);
    } catch {
      // The inspector owns the visible validation message.
    }
  };

  return (
    <div className="json-builder" aria-label={label}>
      <div className="json-builder-head">
        <span>Key</span>
        <span>Value</span>
        <span>Type</span>
        <span aria-hidden="true" />
      </div>
      {entries.length ? (
        entries.map((entry, index) => {
          const inputType =
            entry.type === 'date' || entry.type === 'datetime' || entry.type === 'time'
              ? entry.type === 'datetime'
                ? 'datetime-local'
                : entry.type
              : entry.type === 'number'
                ? 'number'
                : 'text';
          return (
            <div className="json-builder-row" key={`${label}-${index}`}>
              <input
                aria-label={`${label} ${index + 1} key`}
                placeholder="Key"
                value={entry.key}
                onChange={(event) => updateEntry(index, 'key', event.target.value)}
                onBlur={() => commit()}
              />
              {entry.type === 'boolean' ? (
                <select
                  aria-label={`${label} ${index + 1} value`}
                  data-ui-owner="native"
                  value={entry.value || 'false'}
                  onChange={(event) => {
                    updateEntry(index, 'value', event.target.value);
                    commit(
                      latestEntries.current.map((current, entryIndex) =>
                        entryIndex === index ? { ...current, value: event.target.value } : current,
                      ),
                    );
                  }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : entry.type === 'null' ? (
                <span className="json-builder-null">null</span>
              ) : entry.type === 'json' ? (
                <textarea
                  aria-label={`${label} ${index + 1} value`}
                  className="resize-none"
                  placeholder="{} or []"
                  value={entry.value}
                  onChange={(event) => updateEntry(index, 'value', event.target.value)}
                  onBlur={() => commit()}
                  spellCheck="false"
                />
              ) : (
                <input
                  aria-label={`${label} ${index + 1} value`}
                  type={inputType}
                  step={entry.type === 'number' ? 'any' : undefined}
                  placeholder={entry.type === 'expression' ? '${ $context.value }' : 'Value'}
                  value={entry.value}
                  onChange={(event) => updateEntry(index, 'value', event.target.value)}
                  onBlur={() => commit()}
                />
              )}
              <select
                aria-label={`${label} ${index + 1} type`}
                data-ui-owner="native"
                value={entry.type}
                onChange={(event) => {
                  changeType(index, event.target.value as JsonBuilderType);
                }}
              >
                {JSON_BUILDER_TYPES.map(([value, text]) => (
                  <option value={value} key={value}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pair-remove"
                aria-label={`Remove ${label} ${index + 1}`}
                onClick={() => {
                  const next = latestEntries.current.filter((_, entryIndex) => entryIndex !== index);
                  onChange(next);
                  commit(next);
                }}
              >
                ×
              </button>
            </div>
          );
        })
      ) : (
        <p className="pair-empty">No properties yet.</p>
      )}
      <button
        type="button"
        className="pair-add"
        onClick={() => onChange([...latestEntries.current, { key: '', type: 'string', value: '' }])}
      >
        ＋ {addLabel}
      </button>
    </div>
  );
}
