function durationParts(value) {
  const match = String(value || '').match(
    /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/,
  );
  if (match) {
    if (match[1]) return { amount: match[1], unit: 'H' };
    if (match[2]) return { amount: match[2], unit: 'M' };
    if (match[3]) return { amount: match[3], unit: 'S' };
  }
  const days = String(value || '').match(/^P(\d+(?:\.\d+)?)D$/);
  return days ? { amount: days[1], unit: 'D' } : { amount: '', unit: 'S' };
}

function durationValue(amount, unit) {
  if (!amount) return '';
  return unit === 'D' ? `P${amount}D` : `PT${amount}${unit}`;
}

function DurationField({ label, value, onChange }) {
  const parts = durationParts(value);
  return (
    <div className="field duration-field">
      <span>{label}</span>
      <div className="duration-controls">
        <input
          aria-label={`${label} amount`}
          type="number"
          min="0"
          step="any"
          value={parts.amount}
          placeholder="5"
          onChange={(event) => onChange(durationValue(event.target.value, parts.unit))}
        />
        <select
          aria-label={`${label} unit`}
          data-ui-owner="native"
          value={parts.unit}
          onChange={(event) => onChange(durationValue(parts.amount, event.target.value))}
        >
          <option value="S">Seconds</option>
          <option value="M">Minutes</option>
          <option value="H">Hours</option>
          <option value="D">Days</option>
        </select>
      </div>
      <small className="field-help">Stored as ISO 8601 duration{value ? ` · ${value}` : ''}</small>
    </div>
  );
}

export { DurationField };
