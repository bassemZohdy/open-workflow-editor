import type { DragEvent } from 'react';

export interface SwitchCaseItem {
  name: string;
  definition: {
    when?: unknown;
    then?: string;
    [key: string]: unknown;
  };
}

export interface SwitchCaseEditorProps {
  switchCases: SwitchCaseItem[];
  setSwitchCases: (cases: SwitchCaseItem[]) => void;
  applySwitchCases: (cases: SwitchCaseItem[]) => void;
  updateSwitchCase: (index: number, field: 'when' | 'then', value: string, commit?: boolean) => void;
  addSwitchCase: () => void;
  removeSwitchCase: (index: number) => void;
  handleSwitchCaseDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function SwitchCaseEditor({
  switchCases,
  setSwitchCases,
  applySwitchCases,
  updateSwitchCase,
  addSwitchCase,
  removeSwitchCase,
  handleSwitchCaseDrop,
}: SwitchCaseEditorProps) {
  return (
    <div
      className="switch-case-editor"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleSwitchCaseDrop}
    >
      <div className="switch-case-heading">
        <span>Switch cases</span>
        <small>{switchCases.length} configured</small>
      </div>
      {switchCases.map((item, index) => (
        <div className="switch-case-card" key={`${item.name}-${index}`}>
          <div className="switch-case-card-head">
            <strong>Case {index + 1}</strong>
            <button type="button" onClick={() => removeSwitchCase(index)}>
              Remove
            </button>
          </div>
          <label className="field">
            <span>Case name</span>
            <input
              aria-label={`Case ${index + 1} name`}
              value={item.name}
              onChange={(event) => {
                const nextCases = switchCases.map((current, itemIndex) =>
                  itemIndex === index ? { ...current, name: event.target.value } : current,
                );
                setSwitchCases(nextCases);
              }}
              onBlur={(event) => {
                const nextCases = switchCases.map((current, itemIndex) =>
                  itemIndex === index ? { ...current, name: event.target.value } : current,
                );
                applySwitchCases(nextCases);
              }}
            />
          </label>
          <label className="field">
            <span>Condition</span>
            <input
              aria-label={`Case ${index + 1} condition`}
              value={String(item.definition.when || '')}
              onChange={(event) => updateSwitchCase(index, 'when', event.target.value)}
              onBlur={(event) => updateSwitchCase(index, 'when', event.target.value, true)}
            />
          </label>
          <label className="field">
            <span>
              Flow target <small>optional</small>
            </span>
            <input
              aria-label={`Case ${index + 1} flow target`}
              value={item.definition.then || ''}
              onChange={(event) => updateSwitchCase(index, 'then', event.target.value)}
              onBlur={(event) => updateSwitchCase(index, 'then', event.target.value, true)}
            />
          </label>
        </div>
      ))}
      <div className="switch-case-dropzone">
        <span
          draggable
          role="button"
          tabIndex={0}
          aria-label="Drag new switch case"
          onDragStart={(event) => {
            event.dataTransfer.setData('application/open-workflow-switch-case', 'new-case');
            event.dataTransfer.effectAllowed = 'copy';
          }}
        >
          Drag “New case” here
        </span>
        <button type="button" className="button secondary" onClick={addSwitchCase}>
          ＋ Add case
        </button>
      </div>
    </div>
  );
}
