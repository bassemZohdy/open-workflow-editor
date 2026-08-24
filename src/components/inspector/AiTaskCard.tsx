import type { AiComponent } from '../../ai/registry';

interface AiTaskCardProps {
  spec: AiComponent;
  /** Opens the existing sub-flow tab or scaffolds the catalog-backed one. */
  onOpenSubflow: () => void;
}

/**
 * Inspector card for AI delegation tasks (`run.workflow` → `ai` namespace).
 * Explains the composition (sub-flow + catalog-backed provider), shows the
 * target, and offers one-click open/scaffold of the AI sub-flow.
 */
export function AiTaskCard({ spec, onOpenSubflow }: AiTaskCardProps) {
  return (
    <div className="ai-task-card" role="group" aria-label={`AI delegation: ${spec.label}`}>
      <span className="ai-task-card-badge" aria-hidden="true">
        AI
      </span>
      <div className="ai-task-card-body">
        <strong>{spec.label}</strong>
        <p>
          Delegates to{' '}
          <code>
            {spec.subflowNamespace}/{spec.subflowName}
          </code>{' '}
          <small>@{spec.subflowVersion}</small> — a catalog-backed sub-flow that reads the provider endpoint
          from <code>use.catalogs</code> and runs a contract stub until the runtime provider bridge (
          <code>server/aiProviderBridge.js</code>) is wired.
        </p>
        <div className="ai-task-card-actions">
          <button type="button" className="button secondary" onClick={onOpenSubflow}>
            Open / scaffold sub-flow
          </button>
        </div>
      </div>
    </div>
  );
}
