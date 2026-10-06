import * as React from 'react';

export interface UnsavedChangesDialogProps {
  open: boolean;
  onStay(): void;
  onLeave(): void;
}

const titleId = 'admin-unsaved-changes-title';

/**
 * Asks whether to leave with unsaved changes. A native modal dialog, so focus is trapped and Escape
 * means stay; staying is primary and focused first, matching the legacy confirm where Cancel stays
 */
export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({ open, onStay, onLeave }) => {
  const dialog = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
    } else if (!open && element?.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onStay();
      }}
    >
      <h2 className="admin-dialog__title" id={titleId}>
        You have unsaved changes
      </h2>
      <p className="admin-dialog__body">Your changes have not been saved. If you leave this page now, they will be lost.</p>
      <div className="admin-dialog__actions">
        <button className="admin-button admin-button--primary" type="button" autoFocus onClick={onStay}>
          Stay on this page
        </button>
        <button className="admin-button" type="button" onClick={onLeave}>
          Leave without saving
        </button>
      </div>
    </dialog>
  );
};
