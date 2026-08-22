import { ExpressionInput } from '../common/ExpressionInput';

export interface ForTaskEditorProps {
  forEach: string;
  setForEach: (each: string) => void;
  forIn: string;
  setForIn: (inExpr: string) => void;
  forAt: string;
  setForAt: (at: string) => void;
  forTasks: string;
  setForTasks: (tasks: string) => void;
  applyField: (path: string[], value: unknown) => void;
  applyJsonField: (path: string[], jsonText: string, expectedType?: 'object' | 'array') => void;
}

export function ForTaskEditor({
  forEach,
  setForEach,
  forIn,
  setForIn,
  forAt,
  setForAt,
  forTasks,
  setForTasks,
  applyField,
  applyJsonField,
}: ForTaskEditorProps) {
  return (
    <>
      <label className="field">
        <span>
          Loop item variable <small>for.each</small>
        </span>
        <input
          aria-label="Loop item variable"
          value={forEach}
          placeholder="item"
          onChange={(event) => setForEach(event.target.value)}
          onBlur={(event) => applyField(['for', 'each'], event.target.value.trim() || 'item')}
        />
      </label>
      <ExpressionInput
        label="Collection expression"
        ariaLabel="Collection expression"
        value={forIn}
        placeholder="${ $context.items }"
        onChange={setForIn}
        onBlur={(val) =>
          applyField(['for', 'in'], (val !== undefined ? val : forIn).trim() || '${ $context.items }')
        }
        suggestions={['$context.items', '$context.citizens', '$input.list']}
      />
      <label className="field">
        <span>
          Index variable <small>for.at · optional</small>
        </span>
        <input
          aria-label="Index variable"
          value={forAt}
          placeholder="index"
          onChange={(event) => setForAt(event.target.value)}
          onBlur={(event) => applyField(['for', 'at'], event.target.value.trim() || undefined)}
        />
      </label>
      <label className="field">
        <span>
          Loop task list <small>do · JSON</small>
        </span>
        <textarea
          aria-label="Loop task list"
          className="resize-none compact-json-field"
          value={forTasks}
          onChange={(event) => setForTasks(event.target.value)}
          onBlur={(event) => applyJsonField(['do'], event.target.value, 'array')}
          spellCheck="false"
        />
      </label>
      <div className="script-contract-note" role="note">
        <strong>Iteration scope</strong>
        <code>{`context.${forEach || 'item'}`}</code>
        <span>Each collection element is bound to this variable for tasks within the loop body.</span>
      </div>
    </>
  );
}
