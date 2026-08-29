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
  /** The task name in the parent task list. */
  taskName: string;
  /** The AI component kind this delegation targets. */
  kind: AiTaskKind;
  /** The sub-flow target (namespace/name@version). */
  target: string;
  /** Reference to the task list containing this delegation (for rewriting). */
  container: TaskItem[];
  /** Index within the container. */
  index: number;
}

/**
 * Collects all `run.workflow` delegations in a document that target a
 * registered AI component — walking nested containers (`do`/`for`,
 * `fork.branches`, `try`, `catch.do`) recursively.
 */
export function collectMigratableDelegations(document: WorkflowDocument): MigratableDelegation[] {
  const results: MigratableDelegation[] = [];

  const visit = (list: TaskItem[] | undefined, pathPrefix: string) => {
    for (let i = 0; i < (list ?? []).length; i++) {
      const item = list![i];
      const taskName = Object.keys(item)[0];
      if (!taskName) continue;
      const task = item[taskName] as Record<string, unknown>;
      const workflow = (task?.run as { workflow?: { namespace?: string; name?: string; version?: string } })
        ?.workflow;

      if (workflow?.namespace && workflow?.name) {
        const component = findAiComponentBySubflow(workflow.namespace, workflow.name);
        if (component) {
          results.push({
            taskName,
            kind: component.kind,
            target: `${workflow.namespace}/${workflow.name}@${workflow.version ?? 'latest'}`,
            container: list!,
            index: i,
          });
        }
      }

      // Recurse into nested containers.
      visit(task.do as TaskItem[] | undefined, `${pathPrefix}/${taskName}`);
      const branches = task.fork as { branches?: TaskItem[] } | undefined;
      visit(branches?.branches, `${pathPrefix}/${taskName}`);
      visit(task.try as TaskItem[] | undefined, `${pathPrefix}/${taskName}`);
      const catchBlock = task.catch as { do?: TaskItem[] } | undefined;
      visit(catchBlock?.do, `${pathPrefix}/${taskName}`);
    }
  };

  visit(document.do, '/do');
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

  // Re-collect on the cloned document so container references point into the clone.
  const clonedMigratable = collectMigratableDelegations(next);
  const clonedApplicable = clonedMigratable.filter((d) => nativeKeyMap[d.kind]);

  const applied: MigratableDelegation[] = [];
  for (let i = 0; i < clonedApplicable.length; i++) {
    const migration = clonedApplicable[i];
    const nativeKey = nativeKeyMap[migration.kind]!;
    const oldTask = migration.container[migration.index][migration.taskName] as Record<string, unknown>;
    if (!oldTask?.run) continue;

    // Build the native task: copy ALL fields from the old task except `run`,
    // then add the native key body with the sub-flow target.
    const { run: _run, ...rest } = oldTask;
    const nativeTask = {
      [nativeKey]: {
        namespace: (oldTask.run as any).workflow.namespace,
        name: (oldTask.run as any).workflow.name,
        version: (oldTask.run as any).workflow.version,
        ...rest,
      },
    };

    migration.container[migration.index] = nativeTask as TaskItem;
    applied.push(applicable[i]);
  }

  return { document: next, migrations: applied };
}
