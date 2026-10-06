import * as React from 'react';

export interface DialogProps {
  open: boolean;
  /** Escape (the native cancel event); the dialog stays open until the host sets `open` false */
  onClose(): void;
  /** Rendered inside the dialog's heading, which names the dialog */
  header: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * A native modal dialog: `showModal()` traps focus and closing returns focus to the element that had it.
 * Clicking the backdrop does nothing, as in the dialogs this replaced
 */
export const Dialog = ({ open, onClose, header, body, children, footer }: DialogProps) => {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

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
        onClose();
      }}
    >
      <h2 className="admin-dialog__title" id={titleId}>
        {header}
      </h2>
      <div className="admin-dialog__body">
        {body}
        {children}
      </div>
      {footer && <div className="admin-dialog__actions">{footer}</div>}
    </dialog>
  );
};
