/**
 * Scope resolution for the runtime task timeline sub-label.
 *
 * The demo engine builds progress ids as `scope + taskName` (see
 * `createTaskProgress` / `executeTaskList` in `demoRuntime.ts`). Container
 * tasks append scopes like `name/` (do), `name[index]/` (for),
 * `name/branch/` (fork), `name/try/` and `name/catch/` — all slash-containing
 * but never sub-flow delegations. Sub-flow delegation is the only construct
 * that emits a literal `subflow` path segment:
 * `${scope}${taskName}/subflow/${subflow.name}/`.
 *
 * Because the delegating task name is always non-empty, every true sub-flow
 * id contains `/subflow/` with a preceding segment; a simple substring check
 * on `/subflow/` is therefore segment-safe (e.g. `myTask/subflow-check/x`
 * cannot match). Residual ambiguity — a user container or fork branch
 * literally named `subflow` under a parent scope (e.g.
 * `processBatch[0]/subflow/child`) — is benign: that id is still a genuine
 * scoped path, which is exactly what the sub-label wants to disambiguate.
 */
const SUBFLOW_SCOPE_PATTERN = /\/subflow\//;

/**
 * Returns the timeline sub-label scope for a progress item: the raw scoped id
 * when it represents an executed sub-flow step, otherwise `null` so callers
 * fall back to the task type (the pre-sub-flow behavior).
 */
export function resolveTimelineScope(id: string | null | undefined, itemName: string): string | null {
  if (!id || id === itemName) return null;
  return SUBFLOW_SCOPE_PATTERN.test(id) ? id : null;
}
