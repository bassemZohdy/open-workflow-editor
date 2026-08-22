import { useEffect } from 'react';

export interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Canvas & Navigation',
    items: [
      { keys: ['F'], description: 'Fit entire workflow to view' },
      { keys: ['Ctrl', 'F'], description: 'Focus canvas node search' },
      { keys: ['Scroll'], description: 'Zoom in and out on canvas' },
      { keys: ['Space', 'Drag'], description: 'Pan across workflow canvas' },
    ],
  },
  {
    title: 'Editing & Authoring',
    items: [
      { keys: ['Ctrl', 'Z'], description: 'Undo last canvas edit' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo previously undone edit' },
      { keys: ['Ctrl', 'D'], description: 'Duplicate selected task node' },
      { keys: ['Delete'], description: 'Delete selected task from workflow' },
      { keys: ['Esc'], description: 'Deselect task / close open modal' },
    ],
  },
  {
    title: 'Workflow & System',
    items: [
      { keys: ['Ctrl', 'S'], description: 'Save current workflow to local storage' },
      { keys: ['?'], description: 'Open this keyboard shortcuts reference' },
      { keys: ['F1'], description: 'Open help and keyboard shortcuts' },
    ],
  },
];

export function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
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

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog medium"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="shortcuts-dialog-title">⌨️ Keyboard Shortcuts</h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close keyboard shortcuts dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-grid">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.title} className="shortcut-category">
                <h4>{category.title}</h4>
                <div className="shortcut-list">
                  {category.items.map((item) => (
                    <div key={item.description} className="shortcut-item">
                      <span className="shortcut-desc">{item.description}</span>
                      <div className="shortcut-keys">
                        {item.keys.map((key) => (
                          <kbd key={key} className="shortcut-kbd">
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
