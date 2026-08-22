import { JsonObjectBuilder, type JsonBuilderEntry } from '../common/JsonObjectBuilder';

export interface SubflowEditorProps {
  subflowNamespace: string;
  setSubflowNamespace: (namespace: string) => void;
  subflowName: string;
  setSubflowName: (name: string) => void;
  subflowVersion: string;
  setSubflowVersion: (version: string) => void;
  subflowInputEntries: JsonBuilderEntry[];
  setSubflowInputEntries: (entries: JsonBuilderEntry[]) => void;
  applySubflow: (
    entries?: JsonBuilderEntry[],
    overrides?: { namespace?: string; name?: string; version?: string },
  ) => void;
  onOpenSubflow?: (name: string, namespace?: string, version?: string) => void;
  existingWorkflows?: string[];
}

export function SubflowEditor({
  subflowNamespace,
  setSubflowNamespace,
  subflowName,
  setSubflowName,
  subflowVersion,
  setSubflowVersion,
  subflowInputEntries,
  setSubflowInputEntries,
  applySubflow,
  onOpenSubflow,
  existingWorkflows = [],
}: SubflowEditorProps) {
  const isExisting = Boolean(
    subflowName && existingWorkflows.some((w) => w.toLowerCase() === subflowName.toLowerCase()),
  );

  return (
    <>
      <label className="field">
        <span>Sub-flow namespace</span>
        <input
          aria-label="Sub-flow namespace"
          value={subflowNamespace}
          onChange={(event) => setSubflowNamespace(event.target.value)}
          onBlur={(event) => applySubflow(undefined, { namespace: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Sub-flow name</span>
        <input
          aria-label="Sub-flow name"
          value={subflowName}
          onChange={(event) => setSubflowName(event.target.value)}
          onBlur={(event) => applySubflow(undefined, { name: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Sub-flow version</span>
        <input
          aria-label="Sub-flow version"
          value={subflowVersion}
          onChange={(event) => setSubflowVersion(event.target.value)}
          onBlur={(event) => applySubflow(undefined, { version: event.target.value })}
        />
      </label>
      {onOpenSubflow && subflowName && (
        <div style={{ marginTop: -4, marginBottom: 12 }}>
          <button
            type="button"
            className="button secondary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
            onClick={() => onOpenSubflow(subflowName, subflowNamespace, subflowVersion)}
            title={
              isExisting ? `Open “${subflowName}” in editor tab` : `Create “${subflowName}” subflow document`
            }
          >
            {isExisting ? `↗ Open “${subflowName}” in tab` : `＋ Scaffold “${subflowName}” subflow`}
          </button>
        </div>
      )}
      <div className="field">
        <span>
          Sub-flow input <small>Key, value, type</small>
        </span>
        <JsonObjectBuilder
          label="Sub-flow input mapping"
          entries={subflowInputEntries}
          onChange={setSubflowInputEntries}
          onCommit={(entries) => {
            setSubflowInputEntries(entries);
            applySubflow(entries);
          }}
          addLabel="Add sub-flow input"
        />
      </div>
      <div className="script-contract-note" role="note">
        <strong>Sub-flow boundary</strong>
        <span>
          The referenced workflow is resolved by the runtime catalog; this editor does not execute it locally.
        </span>
      </div>
    </>
  );
}
