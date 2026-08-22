export interface CatalogEntry {
  name: string;
  endpoint: string;
}

export interface ScriptTaskEditorProps {
  scriptCode: string;
  setScriptCode: (code: string) => void;
  applyScriptCode: (code?: string) => void;
  catalogEntries: CatalogEntry[];
  setCatalogEntries: React.Dispatch<React.SetStateAction<CatalogEntry[]>>;
  applyCatalogEntries: (entries: CatalogEntry[]) => void;
}

export function ScriptTaskEditor({
  scriptCode,
  setScriptCode,
  applyScriptCode,
  catalogEntries,
  setCatalogEntries,
  applyCatalogEntries,
}: ScriptTaskEditorProps) {
  return (
    <>
      <label className="field">
        <span>
          JavaScript function <small>Node sandbox</small>
        </span>
        <textarea
          aria-label="JavaScript code"
          className="resize-none code-field"
          value={scriptCode}
          placeholder="({ input, context }) => ({ approved: true })"
          onChange={(event) => setScriptCode(event.target.value)}
          onBlur={(event) => applyScriptCode(event.target.value)}
          spellCheck="false"
        />
      </label>
      <div className="resource-catalog-section" aria-label="Resource catalogs">
        <div className="resource-catalog-head">
          <span>Resource catalogs</span>
          <small>workflow use.catalogs</small>
        </div>
        {catalogEntries.map((entry, index) => (
          <div className="resource-catalog-row" key={`catalog-${index}`}>
            <input
              aria-label={`Resource catalog ${index + 1} name`}
              placeholder="Catalog name"
              value={entry.name}
              onChange={(event) =>
                setCatalogEntries((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
              onBlur={() => applyCatalogEntries(catalogEntries)}
            />
            <input
              aria-label={`Resource catalog ${index + 1} endpoint`}
              placeholder="https://catalog.example"
              value={entry.endpoint}
              onChange={(event) =>
                setCatalogEntries((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, endpoint: event.target.value } : item,
                  ),
                )
              }
              onBlur={() => applyCatalogEntries(catalogEntries)}
            />
            <button
              type="button"
              className="pair-remove"
              aria-label={`Remove resource catalog ${index + 1}`}
              onClick={() => {
                const next = catalogEntries.filter((_, itemIndex) => itemIndex !== index);
                setCatalogEntries(next);
                applyCatalogEntries(next);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pair-add"
          onClick={() => setCatalogEntries((current) => [...current, { name: '', endpoint: '' }])}
        >
          ＋ Add resource catalog
        </button>
      </div>
      <div className="script-contract-note" role="note">
        <strong>Function contract</strong>
        <code>{`({ input, context, catalogs }) => output`}</code>
        <span>Return a JSON value. Object fields are added to workflow context for the next task.</span>
      </div>
      <div className="security-note" role="note">
        <strong>Security boundary</strong>
        <span>
          JavaScript is sent to the Node server sandbox with a strict timeout and size limits. The function
          receives only input, context, and catalog descriptors; it has no filesystem, network, process, or
          require access.
        </span>
      </div>
    </>
  );
}
