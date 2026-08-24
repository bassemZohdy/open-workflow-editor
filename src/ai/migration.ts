/**
 * AI delegation migration kit — future-proofing for native AI task keys.
 *
 * When the Open Workflow Specification adds native `llm-call` / `ai-agent-call`
 * (etc.) task types, `migrateAiDelegations` rewrites `run.workflow → ai/*`
 * delegations into the native representation. Today the function is a no-op
 * (returns the document unchanged) because no native keys exist yet.
 *
 * The registry entries carry `kind` identifiers that map 1:1 to future native
 * keys, so the migration is mechanical once the spec lands.
 */

import type { AiTaskKind } from '../scriptContract';
import { findAiComponentBySubflow } from './registry';
import type { TaskItem, WorkflowDocument } from '../types';

/**
 * Describes a `run.workflow` delegation that targets a registered AI component
 * and would be eligible for migration to a native task key.
 */
export interface MigratableDelegation {
  /** Path to the delegation task in the document (e.g. `/do/aiLlmTask`). */
  path: string;
  /** The task name in the parent document. */
  taskName: string;
  /** The AI component kind this delegation targets. */
  kind: AiTaskKind;
  /** The sub-flow target (namespace/name@version). */
  target: string;
}

/**
 * Collects all `run.workflow` delegations in a document that target a
 * registered AI component — these are eligible for migration to native keys
 * when the spec defines them.
 */
export function collectMigratableDelegations(document: WorkflowDocument): MigratableDelegation[] {
  const results: MigratableDelegation[] = [];
  const doList = document.do ?? [];

  for (let i = 0; i < doList.length; i++) {
    const item = doList[i];
    const taskName = Object.keys(item)[0];
    if (!taskName) continue;
    const task = item[taskName] as Record<string, unknown>;
    const workflow = (task?.run as { workflow?: { namespace?: string; name?: string; version?: string } })
      ?.workflow;
    if (!workflow?.namespace || !workflow?.name) continue;

    const component = findAiComponentBySubflow(workflow.namespace, workflow.name);
    if (component) {
      results.push({
        path: `/do/${taskName}`,
        taskName,
        kind: component.kind,
        target: `${workflow.namespace}/${workflow.name}@${workflow.version ?? 'latest'}`,
      });
    }
  }

  return results;
}

/**
 * Rewrites AI delegations in a document to native task keys.
 *
 * Today this is a no-op — the `nativeKeyMap` is empty because the Open
 * Workflow spec has no native AI task types yet. When the spec adds them,
 * pass a map like `{ 'llm-call': 'llm', 'ai-agent-call': 'ai-agent' }`
 * and the function will rewrite each matching delegation.
 *
 * Returns the (possibly rewritten) document and the list of migrations applied.
 */
export function migrateAiDelegations(
  document: WorkflowDocument,
  nativeKeyMap: Partial<Record<AiTaskKind, string>> = {},
): { document: WorkflowDocument; migrations: MigratableDelegation[] } {
  const migratable = collectMigratableDelegations(document);
  const applicable = migratable.filter((d) => nativeKeyMap[d.kind]);

  if (applicable.length === 0) {
    return { document, migrations: [] };
  }

  // Deep-clone the document to avoid mutating the original.
  const next: WorkflowDocument = JSON.parse(JSON.stringify(document));
  const doList: TaskItem[] = next.do ?? [];

  for (const migration of applicable) {
    const nativeKey = nativeKeyMap[migration.kind]!;
    const taskIndex = doList.findIndex((item) => Object.keys(item)[0] === migration.taskName);
    if (taskIndex < 0) continue;

    const oldTaskName = migration.taskName;
    const oldTask = doList[taskIndex][oldTaskName] as Record<string, unknown>;
    const workflow = (oldTask?.run as { workflow?: Record<string, unknown> })?.workflow;
    if (!workflow) continue;

    // Rewrite: replace `run.workflow` delegation with native task key.
    // The native task body carries the same sub-flow target as metadata
    // so the runtime can resolve it.
    const nativeTask = {
      [nativeKey]: {
        namespace: workflow.namespace,
        name: workflow.name,
        version: workflow.version,
      },
    };

    // Preserve the `then` chain if present.
    if (oldTask.then) {
      (nativeTask[nativeKey] as Record<string, unknown>).then = oldTask.then;
    }

    doList[taskIndex] = nativeTask as TaskItem;
  }

  return { document: next, migrations: applicable };
}
