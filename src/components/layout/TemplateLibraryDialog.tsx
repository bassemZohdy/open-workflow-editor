import { useState, useEffect } from 'react';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../../fixtures/templates';

export interface TemplateLibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: WorkflowTemplate) => void;
}

export function TemplateLibraryDialog({ isOpen, onClose, onSelectTemplate }: TemplateLibraryDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate>(WORKFLOW_TEMPLATES[0]);
  const [activeCategory, setActiveCategory] = useState<string>('All');

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

  if (!isOpen) return null;

  const categories = ['All', 'Integration', 'Resilience', 'Parallel', 'Automation'];
  const filteredTemplates =
    activeCategory === 'All'
      ? WORKFLOW_TEMPLATES
      : WORKFLOW_TEMPLATES.filter((tpl) => tpl.category === activeCategory);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="template-dialog-title">📋 Workflow Template Catalog</h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close template catalog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="mode-tabs" style={{ marginBottom: 16 }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={activeCategory === cat ? 'active' : ''}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="template-grid">
            {filteredTemplates.map((template) => {
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <div
                  key={template.id}
                  className={`template-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedTemplate(template)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedTemplate(template);
                  }}
                >
                  <div className="template-card-head">
                    <span className="template-icon" aria-hidden="true">
                      {template.icon}
                    </span>
                    <h4>{template.title}</h4>
                  </div>
                  <p>{template.description}</p>
                  <div className="template-meta">
                    {template.tags.map((tag) => (
                      <span key={tag} className="template-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {selectedTemplate && (
            <div style={{ marginTop: 20 }}>
              <div className="section-heading" style={{ marginBottom: 6 }}>
                <strong>Preview: {selectedTemplate.title}</strong>
                <span>Open Workflow 1.0.3 YAML</span>
              </div>
              <textarea
                readOnly
                value={selectedTemplate.specification}
                style={{
                  width: '100%',
                  height: 140,
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'var(--bg-surface-soft)',
                  color: 'var(--ink)',
                  resize: 'none',
                }}
              />
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '12px 20px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg-surface-soft)',
          }}
        >
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            style={{ background: 'var(--blue)', color: '#fff' }}
            onClick={() => {
              if (selectedTemplate) {
                onSelectTemplate(selectedTemplate);
                onClose();
              }
            }}
          >
            Use template
          </button>
        </div>
      </div>
    </div>
  );
}
