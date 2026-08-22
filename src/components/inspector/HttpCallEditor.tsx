import { JsonObjectBuilder, type JsonBuilderEntry } from '../common/JsonObjectBuilder';
import { KeyValuePairs, type KeyValuePair } from '../common/KeyValuePairs';

export interface HttpCallEditorProps {
  callMode: 'http' | 'function';
  setCallMode: (mode: 'http' | 'function') => void;
  method: string;
  setMethod: (method: string) => void;
  endpoint: string;
  setEndpoint: (endpoint: string) => void;
  callHeaders: KeyValuePair[];
  setCallHeaders: (headers: KeyValuePair[]) => void;
  callQuery: KeyValuePair[];
  setCallQuery: (query: KeyValuePair[]) => void;
  callBodyEntries: JsonBuilderEntry[];
  setCallBodyEntries: (entries: JsonBuilderEntry[]) => void;
  callOutput: string;
  setCallOutput: (output: string) => void;
  callRedirect: boolean;
  setCallRedirect: (redirect: boolean) => void;
  functionName: string;
  setFunctionName: (name: string) => void;
  availableFunctions: string[];
  functionArgEntries: JsonBuilderEntry[];
  setFunctionArgEntries: (entries: JsonBuilderEntry[]) => void;
  applyField: (path: string[], value: unknown) => void;
  applyPairsField: (path: string[], pairs: KeyValuePair[]) => void;
  applyJsonObjectField: (path: string[], entries: JsonBuilderEntry[]) => void;
  onApplyFunctionCall: (name: string, args: JsonBuilderEntry[]) => void;
}

export function HttpCallEditor({
  callMode,
  setCallMode,
  method,
  setMethod,
  endpoint,
  setEndpoint,
  callHeaders,
  setCallHeaders,
  callQuery,
  setCallQuery,
  callBodyEntries,
  setCallBodyEntries,
  callOutput,
  setCallOutput,
  callRedirect,
  setCallRedirect,
  functionName,
  setFunctionName,
  availableFunctions,
  functionArgEntries,
  setFunctionArgEntries,
  applyField,
  applyPairsField,
  applyJsonObjectField,
  onApplyFunctionCall,
}: HttpCallEditorProps) {
  return (
    <>
      <div className="mode-toggle call-mode-toggle" aria-label="Call mode">
        <button
          type="button"
          className={callMode === 'http' ? 'active' : ''}
          onClick={() => setCallMode('http')}
        >
          HTTP Request
        </button>
        <button
          type="button"
          className={callMode === 'function' ? 'active' : ''}
          onClick={() => setCallMode('function')}
        >
          Reusable Function
        </button>
      </div>

      {callMode === 'http' ? (
        <>
          <label className="field">
            <span>Method</span>
            <select
              data-ui-owner="native"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                applyField(['with', 'method'], event.target.value);
              }}
            >
              <option>get</option>
              <option>post</option>
              <option>put</option>
              <option>patch</option>
              <option>delete</option>
            </select>
          </label>
          <label className="field">
            <span>Endpoint</span>
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              onBlur={() => applyField(['with', 'endpoint'], endpoint)}
            />
          </label>
          <details className="inspector-parameter-section" open>
            <summary>
              <span>Request parameters</span>
              <small>Optional</small>
            </summary>
            <div className="parameter-section-body">
              <div className="field">
                <span>
                  Headers <small>Name and value</small>
                </span>
                <KeyValuePairs
                  label="HTTP headers"
                  addLabel="Add header"
                  pairs={callHeaders}
                  onChange={setCallHeaders}
                  onCommit={(pairs) => applyPairsField(['with', 'headers'], pairs)}
                />
              </div>
              <div className="field">
                <span>
                  Query parameters <small>Name and value</small>
                </span>
                <KeyValuePairs
                  label="HTTP query parameters"
                  addLabel="Add parameter"
                  pairs={callQuery}
                  onChange={setCallQuery}
                  onCommit={(pairs) => applyPairsField(['with', 'query'], pairs)}
                />
              </div>
              <div className="field">
                <span>
                  Request body <small>Key, value, type</small>
                </span>
                <JsonObjectBuilder
                  label="HTTP request body"
                  entries={callBodyEntries}
                  onChange={setCallBodyEntries}
                  onCommit={(entries) => applyJsonObjectField(['with', 'body'], entries)}
                  addLabel="Add body property"
                />
              </div>
              <label className="field">
                <span>Response output</span>
                <select
                  data-ui-owner="native"
                  value={callOutput}
                  onChange={(event) => {
                    setCallOutput(event.target.value);
                    applyField(['with', 'output'], event.target.value);
                  }}
                >
                  <option value="content">Content</option>
                  <option value="raw">Raw response</option>
                  <option value="response">Full response</option>
                </select>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={callRedirect}
                  onChange={(event) => {
                    setCallRedirect(event.target.checked);
                    applyField(['with', 'redirect'], event.target.checked);
                  }}
                />
                <span>Treat redirects as errors</span>
              </label>
            </div>
          </details>
        </>
      ) : (
        <div className="function-call-section">
          <label className="field">
            <span>
              Function name <small>use.functions</small>
            </span>
            {availableFunctions.length > 0 ? (
              <div className="function-picker-row">
                <select
                  data-ui-owner="native"
                  value={functionName}
                  aria-label="Available functions"
                  onChange={(event) => {
                    setFunctionName(event.target.value);
                    onApplyFunctionCall(event.target.value, functionArgEntries);
                  }}
                >
                  <option value="">Select a function…</option>
                  {availableFunctions.map((fn) => (
                    <option key={fn} value={fn}>
                      {fn}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Custom function name"
                  placeholder="Or enter function name"
                  value={functionName}
                  onChange={(event) => setFunctionName(event.target.value)}
                  onBlur={() => onApplyFunctionCall(functionName, functionArgEntries)}
                />
              </div>
            ) : (
              <input
                aria-label="Function name"
                placeholder="e.g. sendNotification"
                value={functionName}
                onChange={(event) => setFunctionName(event.target.value)}
                onBlur={() => onApplyFunctionCall(functionName, functionArgEntries)}
              />
            )}
          </label>

          <div className="field">
            <span>
              Function arguments <small>with · Key, value, type</small>
            </span>
            <JsonObjectBuilder
              label="Function call arguments"
              entries={functionArgEntries}
              onChange={setFunctionArgEntries}
              onCommit={(entries) => onApplyFunctionCall(functionName, entries)}
              addLabel="Add argument"
            />
          </div>

          <div className="script-contract-note" role="note">
            <strong>Function Invocation</strong>
            <code>{`call: ${functionName || '<function-name>'}`}</code>
            <span>
              Invokes a reusable task defined in the document&apos;s <code>use.functions</code> declaration.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
