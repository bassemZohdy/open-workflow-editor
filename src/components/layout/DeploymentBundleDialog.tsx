import { useState, useMemo } from 'react';
import { generateDeploymentBundle, type DeploymentBundle } from '../../deploymentBundle';

export interface DeploymentBundleDialogProps {
  open: boolean;
  onClose: () => void;
  specYaml: string;
  workflowName: string;
}

type FileTabKey = 'workflow.yaml' | 'Dockerfile' | 'deployment.yaml' | 'README.md';

export function DeploymentBundleDialog({
  open,
  onClose,
  specYaml,
  workflowName,
}: DeploymentBundleDialogProps) {
  const [activeTab, setActiveTab] = useState<FileTabKey>('deployment.yaml');
  const [copyNotice, setCopyNotice] = useState('');

  const bundle: DeploymentBundle = useMemo(
    () => generateDeploymentBundle(specYaml, workflowName),
    [specYaml, workflowName],
  );

  if (!open) return null;

  const currentContent =
    activeTab === 'workflow.yaml'
      ? bundle.workflowYaml
      : activeTab === 'Dockerfile'
        ? bundle.dockerfile
        : activeTab === 'deployment.yaml'
          ? bundle.kubernetesYaml
          : bundle.readmeMd;

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopyNotice(`Copied ${activeTab}`);
      window.setTimeout(() => setCopyNotice(''), 2000);
    } catch {
      setCopyNotice('Clipboard unavailable');
      window.setTimeout(() => setCopyNotice(''), 2000);
    }
  };

  const handleDownloadCurrent = () => {
    const blob = new Blob([currentContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Workflow Deployment Bundle"
      onClick={onClose}
    >
      <div
        className="modal-card revision-history-card"
        style={{ maxWidth: 840, width: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>📦 Production Deployment Bundle</h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
              Docker &amp; Kubernetes artifacts for <strong>{workflowName}</strong>
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close deployment bundle dialog"
          >
            ✕
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--bg-surface-soft)',
            borderBottom: '1px solid var(--line)',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            {(['deployment.yaml', 'Dockerfile', 'workflow.yaml', 'README.md'] as FileTabKey[]).map(
              (fileKey) => (
                <button
                  key={fileKey}
                  type="button"
                  onClick={() => setActiveTab(fileKey)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: activeTab === fileKey ? 600 : 400,
                    background: activeTab === fileKey ? 'var(--bg-card)' : 'transparent',
                    color: activeTab === fileKey ? 'var(--ink)' : 'var(--muted)',
                    border: '1px solid',
                    borderColor: activeTab === fileKey ? 'var(--line)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {fileKey}
                </button>
              ),
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {copyNotice && (
              <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{copyNotice}</span>
            )}
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={handleCopyCurrent}
            >
              📋 Copy {activeTab}
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={handleDownloadCurrent}
            >
              ⬇ Download {activeTab}
            </button>
          </div>
        </div>

        <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
          <pre
            style={{
              margin: 0,
              padding: 14,
              borderRadius: 6,
              background: 'var(--bg-surface)',
              border: '1px solid var(--line)',
              fontFamily: 'DM Mono, monospace',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--ink)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {currentContent}
          </pre>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end', padding: '12px 16px' }}>
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
