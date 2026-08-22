export interface ListenConfigOptions {
  mode?: string;
  type?: string;
  source?: string;
  read?: string;
}

export interface ListenTaskEditorProps {
  listenMode: string;
  setListenMode: (mode: string) => void;
  listenType: string;
  setListenType: (type: string) => void;
  listenSource: string;
  setListenSource: (source: string) => void;
  listenRead: string;
  setListenRead: (read: string) => void;
  applyListenConfig: (options: ListenConfigOptions) => void;
}

export function ListenTaskEditor({
  listenMode,
  setListenMode,
  listenType,
  setListenType,
  listenSource,
  setListenSource,
  listenRead,
  setListenRead,
  applyListenConfig,
}: ListenTaskEditorProps) {
  return (
    <>
      <label className="field">
        <span>
          Listen mode <small>to.one · to.any</small>
        </span>
        <select
          aria-label="Listen mode"
          data-ui-owner="native"
          value={listenMode}
          onChange={(event) => {
            setListenMode(event.target.value);
            applyListenConfig({ mode: event.target.value });
          }}
        >
          <option value="one">Single event (to.one)</option>
          <option value="any">Any of events (to.any)</option>
        </select>
      </label>
      <label className="field">
        <span>
          Event type <small>with.type</small>
        </span>
        <input
          aria-label="Event type"
          value={listenType}
          placeholder="com.example.event"
          onChange={(event) => setListenType(event.target.value)}
          onBlur={() => applyListenConfig({ type: listenType })}
        />
      </label>
      <label className="field">
        <span>
          Event source <small>with.source · optional</small>
        </span>
        <input
          aria-label="Event source"
          value={listenSource}
          placeholder="https://example.com/events"
          onChange={(event) => setListenSource(event.target.value)}
          onBlur={() => applyListenConfig({ source: listenSource })}
        />
      </label>
      <label className="field">
        <span>
          Read mapping <small>read · optional</small>
        </span>
        <select
          aria-label="Read mapping"
          data-ui-owner="native"
          value={listenRead}
          onChange={(event) => {
            setListenRead(event.target.value);
            applyListenConfig({ read: event.target.value });
          }}
        >
          <option value="data">Data payload (data)</option>
          <option value="event">Full event (event)</option>
          <option value="">Default (none)</option>
        </select>
      </label>
      <div className="script-contract-note" role="note">
        <strong>Event subscription</strong>
        <span>
          The workflow pauses and waits until an external event matching this specification is published to
          the runtime.
        </span>
      </div>
    </>
  );
}
