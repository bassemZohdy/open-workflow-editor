import { DurationField } from '../common/DurationField';

export interface CatchConfigOptions {
  errorType?: string;
  retryDelay?: string;
  retryCount?: string;
}

export interface TryTaskEditorProps {
  tryTasks: string;
  setTryTasks: (tasks: string) => void;
  catchErrorType: string;
  setCatchErrorType: (type: string) => void;
  retryDelay: string;
  setRetryDelay: (delay: string) => void;
  retryCount: string;
  setRetryCount: (count: string) => void;
  catchTasks: string;
  setCatchTasks: (tasks: string) => void;
  applyJsonField: (path: string[], jsonText: string, expectedType?: 'object' | 'array') => void;
  applyCatchConfig: (options: CatchConfigOptions) => void;
}

export function TryTaskEditor({
  tryTasks,
  setTryTasks,
  catchErrorType,
  setCatchErrorType,
  retryDelay,
  setRetryDelay,
  retryCount,
  setRetryCount,
  catchTasks,
  setCatchTasks,
  applyJsonField,
  applyCatchConfig,
}: TryTaskEditorProps) {
  return (
    <>
      <label className="field">
        <span>
          Try task list <small>try · JSON</small>
        </span>
        <textarea
          aria-label="Try task list"
          className="resize-none compact-json-field"
          value={tryTasks}
          onChange={(event) => setTryTasks(event.target.value)}
          onBlur={() => applyJsonField(['try'], tryTasks, 'array')}
          spellCheck="false"
        />
      </label>
      <details className="inspector-parameter-section" open>
        <summary>
          <span>Error handling &amp; fallback</span>
          <small>catch</small>
        </summary>
        <div className="parameter-section-body">
          <label className="field">
            <span>
              Catch error type <small>catch.errors.with.type · optional</small>
            </span>
            <input
              aria-label="Catch error type"
              value={catchErrorType}
              placeholder="https://example.com/errors/timeout"
              onChange={(event) => setCatchErrorType(event.target.value)}
              onBlur={() => applyCatchConfig({ errorType: catchErrorType })}
            />
          </label>
          <div className="inspector-section-heading">
            <span>Retry policy</span>
            <small>catch.retry · optional</small>
          </div>
          <DurationField
            label="Retry delay"
            value={retryDelay}
            onChange={(nextValue) => {
              setRetryDelay(nextValue);
              applyCatchConfig({ retryDelay: nextValue });
            }}
          />
          <label className="field">
            <span>
              Max attempts <small>catch.retry.limit.attempt.count</small>
            </span>
            <input
              aria-label="Max attempts"
              type="number"
              min="0"
              max="20"
              value={retryCount}
              placeholder="3"
              onChange={(event) => setRetryCount(event.target.value)}
              onBlur={() => applyCatchConfig({ retryCount })}
            />
          </label>
          <label className="field">
            <span>
              Fallback task list <small>catch.do · JSON</small>
            </span>
            <textarea
              aria-label="Fallback task list"
              className="resize-none compact-json-field"
              value={catchTasks}
              onChange={(event) => setCatchTasks(event.target.value)}
              onBlur={() => applyJsonField(['catch', 'do'], catchTasks, 'array')}
              spellCheck="false"
            />
          </label>
        </div>
      </details>
    </>
  );
}
