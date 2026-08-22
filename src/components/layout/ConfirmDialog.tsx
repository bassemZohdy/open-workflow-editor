import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  task: { name: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ task, onCancel, onConfirm }: ConfirmDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!task) return undefined;
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, task]);

  if (!task) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-task-title"
      >
        <span className="dialog-kicker">Destructive action</span>
        <h2 id="delete-task-title">Delete “{task.name}”?</h2>
        <p>
          This removes the task from the workflow and clears routes pointing to it. You can undo the change
          with <kbd>⌘Z</kbd> or <kbd>Ctrl+Z</kbd>.
        </p>
        <div className="dialog-actions">
          <button ref={cancelButton} type="button" className="button secondary" onClick={onCancel}>
            Keep task
          </button>
          <button type="button" className="button danger-button" onClick={onConfirm}>
            Delete task
          </button>
        </div>
      </section>
    </div>
  );
}
