import { describe, expect, it } from 'vitest';
import { resolveTimelineScope } from './runtimeTimelineScope';

describe('resolveTimelineScope', () => {
  it('falls back to the task type for plain ids equal to the task name', () => {
    expect(resolveTimelineScope('simpleTask', 'simpleTask')).toBeNull();
  });

  it('restores the pre-Task-45 type fallback for for-loop scoped ids', () => {
    expect(resolveTimelineScope('processBatch[0]/innerTask', 'innerTask')).toBeNull();
  });

  it('restores the type fallback for fork branch scoped ids', () => {
    expect(resolveTimelineScope('fanOut/fastTrack/validate', 'validate')).toBeNull();
  });

  it('restores the type fallback for try scoped ids', () => {
    expect(resolveTimelineScope('risky/try/attempt', 'attempt')).toBeNull();
  });

  it('restores the type fallback for catch scoped ids', () => {
    expect(resolveTimelineScope('risky/catch/fallback', 'fallback')).toBeNull();
  });

  it('restores the type fallback for nested do scoped ids', () => {
    expect(resolveTimelineScope('outer/inner', 'inner')).toBeNull();
  });

  it('shows the scoped id for executed sub-flow steps', () => {
    expect(resolveTimelineScope('runTask/subflow/billing-process/initSubflow', 'initSubflow')).toBe(
      'runTask/subflow/billing-process/initSubflow',
    );
  });

  it('shows the scoped id for sub-flow steps nested under a parent scope', () => {
    expect(resolveTimelineScope('loop[1]/delegate/subflow/ai-review/summarize', 'summarize')).toBe(
      'loop[1]/delegate/subflow/ai-review/summarize',
    );
  });

  it('does not treat a task literally named "subflow" as sub-flow scope when it is a leaf', () => {
    // for-scope is `outer[0]/` + task name — no path segment after `subflow`.
    expect(resolveTimelineScope('processBatch[0]/subflow', 'subflow')).toBeNull();
  });

  it('does not treat a top-level container named "subflow" as sub-flow scope', () => {
    // Real delegations always have a task segment before `/subflow/`;
    // `subflow/child` is a plain nested-do scope.
    expect(resolveTimelineScope('subflow/child', 'child')).toBeNull();
  });

  it('treats a container named "subflow" deeper in a path as scoped (benign)', () => {
    // `processBatch[0]/subflow/child` matches the `/subflow/` segment rule even
    // though it is a user-named container, not a delegation. Showing the raw
    // path is still the useful disambiguation there, so we accept the overlap.
    expect(resolveTimelineScope('processBatch[0]/subflow/child', 'child')).toBe(
      'processBatch[0]/subflow/child',
    );
  });

  it('requires a full "subflow" path segment, not a substring', () => {
    expect(resolveTimelineScope('myTask/subflow-check/x', 'x')).toBeNull();
    expect(resolveTimelineScope('myTask/subflowX/y', 'y')).toBeNull();
  });

  it('ignores missing or empty ids', () => {
    expect(resolveTimelineScope(undefined, 'task')).toBeNull();
    expect(resolveTimelineScope(null, 'task')).toBeNull();
    expect(resolveTimelineScope('', 'task')).toBeNull();
  });
});
