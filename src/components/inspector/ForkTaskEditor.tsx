export interface ForkBranchItem {
  name: string;
  taskJson: string;
}

export interface ForkTaskEditorProps {
  forkBranches: ForkBranchItem[];
  setForkBranches: (branches: ForkBranchItem[]) => void;
  applyForkBranches: (branches: ForkBranchItem[]) => void;
  addForkBranch: () => void;
  removeForkBranch: (index: number) => void;
  updateForkBranchName: (index: number, name: string) => void;
  updateForkBranchTask: (index: number, taskJson: string) => void;
  forkCompete: boolean;
  setForkCompete: (compete: boolean) => void;
  applyField: (path: string[], value: unknown) => void;
}

export function ForkTaskEditor({
  forkBranches,
  setForkBranches,
  addForkBranch,
  removeForkBranch,
  updateForkBranchName,
  updateForkBranchTask,
  forkCompete,
  setForkCompete,
  applyField,
}: ForkTaskEditorProps) {
  return (
    <>
      <label className="checkbox-field">
        <input
          type="checkbox"
          aria-label="Competitive fork"
          checked={forkCompete}
          onChange={(event) => {
            setForkCompete(event.target.checked);
            applyField(['fork', 'compete'], event.target.checked ? true : undefined);
          }}
        />
        <span>First branch to complete finishes fork (compete)</span>
      </label>
      <div className="switch-case-editor">
        <div className="switch-case-heading">
          <span>Parallel branches</span>
          <small>{forkBranches.length} configured</small>
        </div>
        {forkBranches.map((branch, index) => (
          <div className="switch-case-card" key={`branch-${index}`}>
            <div className="switch-case-card-head">
              <strong>Branch {index + 1}</strong>
              <button
                type="button"
                onClick={() => removeForkBranch(index)}
                aria-label={`Remove branch ${index + 1}`}
              >
                Remove
              </button>
            </div>
            <label className="field">
              <span>Branch name</span>
              <input
                aria-label={`Branch ${index + 1} name`}
                value={branch.name}
                onChange={(event) => {
                  const nextBranches = forkBranches.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: event.target.value } : item,
                  );
                  setForkBranches(nextBranches);
                }}
                onBlur={() => updateForkBranchName(index, branch.name)}
              />
            </label>
            <label className="field">
              <span>
                Branch task definition <small>JSON</small>
              </span>
              <textarea
                aria-label={`Branch ${index + 1} task JSON`}
                className="resize-none compact-json-field"
                value={branch.taskJson}
                onChange={(event) => {
                  const nextBranches = forkBranches.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, taskJson: event.target.value } : item,
                  );
                  setForkBranches(nextBranches);
                }}
                onBlur={() => updateForkBranchTask(index, branch.taskJson)}
                spellCheck="false"
              />
            </label>
          </div>
        ))}
        <div className="switch-case-dropzone">
          <button type="button" className="button secondary" onClick={addForkBranch}>
            ＋ Add branch
          </button>
        </div>
      </div>
    </>
  );
}
