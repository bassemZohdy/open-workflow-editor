import { useEffect, useRef } from 'react';

function pairsToObject(pairs) {
  return Object.fromEntries(pairs.map(({ key, value }) => [key.trim(), value]).filter(([key]) => key));
}

function KeyValuePairs({ label, addLabel, pairs, onChange, onCommit }) {
  const latestPairs = useRef(pairs);
  useEffect(() => {
    latestPairs.current = pairs;
  }, [pairs]);

  const updatePair = (index, field, value) => {
    const nextPairs = latestPairs.current.map((pair, pairIndex) =>
      pairIndex === index ? { ...pair, [field]: value } : pair,
    );
    latestPairs.current = nextPairs;
    onChange(nextPairs);
  };

  return (
    <div className="pair-editor" aria-label={label}>
      {pairs.length ? (
        pairs.map((pair, index) => (
          <div className="pair-row" key={`${label}-${index}`}>
            <input
              aria-label={`${label} ${index + 1} name`}
              placeholder="Name"
              value={pair.key}
              onChange={(event) => updatePair(index, 'key', event.target.value)}
              onBlur={() => onCommit(latestPairs.current)}
            />
            <input
              aria-label={`${label} ${index + 1} value`}
              placeholder="Value"
              value={pair.value}
              onChange={(event) => updatePair(index, 'value', event.target.value)}
              onBlur={() => onCommit(latestPairs.current)}
            />
            <button
              type="button"
              className="pair-remove"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => {
                const nextPairs = pairs.filter((_, pairIndex) => pairIndex !== index);
                onChange(nextPairs);
                onCommit(nextPairs);
              }}
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <p className="pair-empty">No entries yet.</p>
      )}
      <button type="button" className="pair-add" onClick={() => onChange([...pairs, { key: '', value: '' }])}>
        ＋ {addLabel}
      </button>
    </div>
  );
}

export { KeyValuePairs, pairsToObject };
