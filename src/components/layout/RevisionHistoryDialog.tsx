import { useState, useEffect, useMemo } from 'react';
import { computeLineDiff, summarizeDiff } from '../../diffUtils';
import type { WorkflowRevision } from '../../types';

export interface RevisionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpecification: string;
  revisions: WorkflowRevision[];
  onRestoreRevision: (revision: WorkflowRevision) => void;
}

export function RevisionHistoryDialog({
  isOpen,
  onClose,
  currentSpecification,
  revisions,
  onRestoreRevision,
}: RevisionHistoryDialogProps) {
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>('');

  useEffect(() => {
    if (revisions.length > 0) {
      setSelectedRevisionId(revisions[0].id);
    }
  }, [revisions]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedRevision = useMemo(() => {
    return revisions.find((r) => r.id === selectedRevisionId) || revisions[0];
  }, [revisions, selectedRevisionId]);

  const diffLines = useMemo(() => {
    if (!selectedRevision) return [];
    return computeLineDiff(selectedRevision.specification, currentSpecification);
  }, [selectedRevision, currentSpecification]);

  const diffSummary = useMemo(() => summarizeDiff(diffLines), [diffLines]);

  if (!isOpen) return null;

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 880, height: '80vh' }}
      >
        <div className="modal-header">
          <h3 id="revision-dialog-title">🕒 Workflow Revision History & Diff</h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close revision history"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            gap: 16,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {/* Left panel: revision list */}
          <div
            style={{
              borderRight: '1px solid var(--line)',
              background: 'var(--bg-surface-soft)',
              padding: 12,
              overflowY: 'auto',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--muted)',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 10,
              }}
            >
              Revisions ({revisions.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {revisions.map((rev, index) => {
                const isSelected = rev.id === selectedRevisionId;
                return (
                  <div
                    key={rev.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedRevisionId(rev.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedRevisionId(rev.id);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--blue)' : 'var(--line)',
                      background: isSelected ? 'var(--blue-soft)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: isSelected ? 'var(--blue)' : 'var(--ink)' }}>
                        {index === 0 ? 'Current / Latest' : `Revision #${revisions.length - index}`}
                      </strong>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                        {rev.specification.split('\n').length} lines
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {formatTimestamp(rev.timestamp)}
                    </div>
                    {rev.summary && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--ink)',
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rev.summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Diff Viewer */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{diffSummary.added} added</span>
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>-{diffSummary.removed} removed</span>
                <span style={{ color: 'var(--muted)' }}>{diffSummary.unchanged} unchanged</span>
              </div>
              {selectedRevision && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    onRestoreRevision(selectedRevision);
                    onClose();
                  }}
                  title="Restore this revision into the editor"
                  style={{ fontSize: 11, height: 26 }}
                >
                  ↺ Restore revision
                </button>
              )}
            </div>

            <div
              style={{
                flex: 1,
                overflow: 'auto',
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                background: 'var(--bg-surface-soft)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: 6,
              }}
            >
              {diffLines.map((line, idx) => {
                const bg =
                  line.type === 'added'
                    ? 'rgba(49, 164, 124, 0.12)'
                    : line.type === 'removed'
                      ? 'rgba(220, 38, 38, 0.12)'
                      : 'transparent';
                const textCol =
                  line.type === 'added'
                    ? 'var(--green)'
                    : line.type === 'removed'
                      ? 'var(--red)'
                      : 'var(--ink)';
                const sign = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      background: bg,
                      color: textCol,
                      padding: '1px 4px',
                      lineHeight: 1.4,
                      whiteSpace: 'pre',
                    }}
                  >
                    <span style={{ width: 16, userSelect: 'none', color: 'var(--muted)' }}>{sign}</span>
                    <span style={{ flex: 1 }}>{line.text || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '10px 16px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg-surface-soft)',
          }}
        >
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          {selectedRevision && (
            <button
              type="button"
              className="button"
              style={{ background: 'var(--blue)', color: '#fff' }}
              onClick={() => {
                onRestoreRevision(selectedRevision);
                onClose();
              }}
            >
              Restore this revision
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
