import type { WorkflowDocument } from './types';

/**
 * Task 65: `Date.now()` collides for two AI palette adds in the same
 * millisecond, so the scaffold effect (keyed on `requestId`) silently drops
 * the second request. This sequence issues strictly increasing ids: it always
 * advances past the previous id, even when the clock stalls or rewinds, and
 * catches up when the clock jumps forward.
 */
export type RequestIdClock = () => number;

export function createRequestIdSequence(now: RequestIdClock = () => Date.now()): () => number {
  let last = 0;
  return () => {
    last = Math.max(last + 1, now());
    return last;
  };
}

/**
 * Task 66: sub-flow tab/library matching must honor the caller's namespace
 * strictly. Only a CALLER-undefined namespace falls back to name-only
 * matching (legacy rule); a candidate whose namespace is missing — or cannot
 * be verified because its specification does not parse — is NOT a match.
 */
export function matchesSubflowNamespace(
  requestedNamespace: string | undefined,
  candidateNamespace: string | undefined,
): boolean {
  if (requestedNamespace === undefined) return true;
  return candidateNamespace === requestedNamespace;
}

export interface SubflowRecordLike {
  id: string;
  name: string;
  specification: string;
}

export interface SubflowTargetLike {
  name: string;
  namespace?: string;
}

export interface ParsedWorkflowLike {
  document?: { namespace?: string };
}

export type WorkflowSpecParser = (specification: string) => { document: ParsedWorkflowLike };

/**
 * Finds the open tab that already holds the requested sub-flow, if any.
 * Mirrors `handleOpenSubflow`'s lookup: the active tab is read live, other
 * tabs come from the stashed memory map, and tabs backed by a library record
 * are verified by parsing that record (parse failure → not a match).
 */
export function findMatchingSubflowTab(params: {
  tabIds: readonly string[];
  activeTabId: string;
  activeTab: { name: string; document: WorkflowDocument };
  tabMemories: ReadonlyMap<string, { name: string; document?: WorkflowDocument }>;
  records: readonly SubflowRecordLike[];
  target: SubflowTargetLike;
  parseWorkflowSpec: WorkflowSpecParser;
}): string | undefined {
  const { tabIds, activeTabId, activeTab, tabMemories, records, target, parseWorkflowSpec } = params;
  return tabIds.find((tabId) => {
    const memory = tabId === activeTabId ? activeTab : tabMemories.get(tabId);
    if (memory?.name === target.name) {
      return matchesSubflowNamespace(target.namespace, memory.document?.document?.namespace);
    }
    const record = records.find((candidate) => candidate.id === tabId);
    if (record?.name !== target.name) return false;
    if (target.namespace === undefined) return true;
    try {
      return matchesSubflowNamespace(
        target.namespace,
        parseWorkflowSpec(record.specification).document.document?.namespace,
      );
    } catch {
      // Unparsable record: namespace unverifiable → treat as a non-match.
      return false;
    }
  });
}

/**
 * Library-record match for the scaffold path: case-insensitive name compare
 * (with the historical record-id fallback), then a strict namespace check.
 */
export function subflowRecordMatchesTarget(
  record: SubflowRecordLike,
  target: SubflowTargetLike,
  parseWorkflowSpec: WorkflowSpecParser,
): boolean {
  if (record.name.toLowerCase() !== target.name.toLowerCase() && record.id !== target.name) return false;
  if (target.namespace === undefined) return true;
  try {
    return matchesSubflowNamespace(
      target.namespace,
      parseWorkflowSpec(record.specification).document.document?.namespace,
    );
  } catch {
    // Unparsable record: namespace unverifiable → treat as a non-match.
    return false;
  }
}

/**
 * Task 67: folds the workspace document list. The ACTIVE tab contributes its
 * live (current-render) document — its stashed ref entry is only refreshed by
 * a commit-phase effect, so same-pass consumers (sub-flow issues, deployment
 * bundle, runtime) would otherwise read a pre-edit snapshot. Unparsable
 * library entries are skipped: they can neither execute nor ship.
 */
export function collectWorkspaceDocuments(
  tabMemories: ReadonlyMap<string, { id: string; document: WorkflowDocument }>,
  activeTab: { id: string; document: WorkflowDocument },
  records: readonly { specification: string }[],
  parseWorkflowSpec: (specification: string) => { document: WorkflowDocument },
): WorkflowDocument[] {
  const documents: WorkflowDocument[] = [];
  for (const [tabId, memory] of tabMemories) {
    documents.push(tabId === activeTab.id ? activeTab.document : memory.document);
  }
  if (!tabMemories.has(activeTab.id)) documents.push(activeTab.document);
  for (const record of records) {
    try {
      documents.push(parseWorkflowSpec(record.specification).document);
    } catch {
      // Ignore unparsable library entries.
    }
  }
  return documents;
}
