import { useEffect, useRef } from 'react';

const JSON_BUILDER_TYPES = [
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

function inferJsonBuilderType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return 'json';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' && /^\$\{[\s\S]*\}$/.test(value.trim())) return 'expression';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  if (typeof value === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return 'time';
  return 'string';
}

function normalizeJsonBuilderInput(type, value) {
  const text = String(value ?? '');
  if (type === 'datetime' && text.includes('T')) return text.slice(0, 16);
  if (type === 'date' && text.includes('T')) return text.slice(0, 10);
  if (type === 'time' && text.length > 5) return text.slice(0, 5);
  return text;
}

function objectToJsonBuilderEntries(value) {
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

function jsonBuilderEntryValue(entry) {
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

function jsonBuilderEntriesToObject(entries) {
  return Object.fromEntries(
    entries.map((entry) => [entry.key.trim(), jsonBuilderEntryValue(entry)]).filter(([key]) => key),
  );
}

function JsonObjectBuilder({ label, entries, onChange, onCommit, addLabel = 'Add property' }) {
  const latestEntries = useRef(entries);
  useEffect(() => {
    latestEntries.current = entries;
  }, [entries]);

  const updateEntry = (index, field, value) => {
    const next = latestEntries.current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [field]: value } : entry,
    );
    latestEntries.current = next;
    onChange(next);
  };

  const changeType = (index, type) => {
    const current = latestEntries.current[index];
    const nextValue =
      type === 'boolean'
        ? 'false'
        : type === 'null'
          ? ''
          : normalizeJsonBuilderInput(type, current?.value || '');
    const next = entries.map((entry, entryIndex) =>
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
                      entries.map((current, entryIndex) =>
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
                onChange={(event) => changeType(index, event.target.value)}
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
                  const next = entries.filter((_, entryIndex) => entryIndex !== index);
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
        onClick={() => onChange([...entries, { key: '', type: 'string', value: '' }])}
      >
        ＋ {addLabel}
      </button>
    </div>
  );
}

export { JsonObjectBuilder, objectToJsonBuilderEntries, jsonBuilderEntriesToObject };
