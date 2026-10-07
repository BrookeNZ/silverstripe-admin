import * as React from 'react';
import { Stack } from './Stack';

export interface DialogProps {
  open: boolean;
  /** Escape (the native cancel event); the dialog stays open until the host sets `open` false */
  onClose(): void;
  /** Rendered inside the dialog's heading, which names the dialog */
  header: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** An error raised while the dialog is open, shown at the top of the body: the backdrop would hide a toast */
  alert?: React.ReactNode;
  /** Opening focuses the heading rather than the first control, for a body that is still loading its controls */
  focusHeading?: boolean;
}

/**
 * A native modal dialog: `showModal()` traps focus and closing returns focus to the element that had it.
 * Clicking the backdrop does nothing, as in the dialogs this replaced. Opening focuses the control marked
 * `data-autofocus` (such as Cancel before a destructive action), else the heading when `focusHeading` is set,
 * else the first control; React's `autoFocus` cannot do it, because it runs while the dialog is still closed.
 *
 * Errors raised while a modal is open render in the modal (`alert`), never as a toast, which the backdrop
 * covers and the inert page around the dialog keeps from screen readers
 */
export const Dialog = ({ open, onClose, header, body, children, footer, alert, focusHeading }: DialogProps) => {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      const target = element.querySelector<HTMLElement>('[data-autofocus]') ?? (focusHeading ? element.querySelector<HTMLElement>('h2') : null);
      target?.focus();
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
      <h2 className="admin-dialog__title" id={titleId} tabIndex={focusHeading ? -1 : undefined}>
        {header}
      </h2>
      <Stack className="admin-dialog__body" spacing="md">
        {alert && (
          <p className="admin-dialog__alert" role="alert">
            {alert}
          </p>
        )}
        {body}
        {children}
      </Stack>
      {footer && (
        <Stack className="admin-dialog__actions" direction="row" spacing="sm">
          {footer}
        </Stack>
      )}
    </dialog>
  );
};
