/**
 * A short message about something that just happened, drawn with an icon for its type. It closes
 * itself after `dismissAfter` milliseconds, a timer that stops while the toast is hovered or holds
 * focus and starts again when both end; `onClose` draws a close button and is called however the toast
 * closes. A toast with neither stays until its owner unmounts it, and an error ignores `dismissAfter`,
 * as legacy kept errors until dismissed.
 *
 * The toast has no live region role: an element that arrives with its text already in it is often not
 * read, so the owner announces the text through a region that was on the page first (the shell's
 * announcer). The design has no toast
 */
import * as React from 'react';
import { CloseIcon } from './icons';
import { statusIcons } from './statusIcons';
import type { StatusType } from './statusIcons';

export type ToastType = StatusType;

export interface ToastProps {
  children: React.ReactNode;
  type?: ToastType;
  dismissAfter?: number;
  onClose?: () => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const Toast = ({ children, type = 'info', dismissAfter = 0, onClose, className, ref }: ToastProps) => {
  const [open, setOpen] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const timedFor = type === 'error' ? 0 : dismissAfter;

  // Read at close time, so an owner passing a fresh onClose on each render does not restart the timer
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  const close = React.useCallback(() => {
    setOpen(false);
    onCloseRef.current?.();
  }, []);

  React.useEffect(() => {
    if (!open || !timedFor || hovered || focused) {
      return undefined;
    }
    const timer = setTimeout(close, timedFor);
    return () => clearTimeout(timer);
  }, [open, timedFor, hovered, focused, close]);

  if (!open) {
    return null;
  }

  const { Icon, label } = statusIcons[type];
  const classes = ['admin-toast', `admin-toast--${type}`, className].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => setFocused(event.currentTarget.contains(event.relatedTarget as Node | null))}
    >
      <Icon className="admin-toast__icon" label={label} />
      <span className="admin-toast__message">{children}</span>
      {onClose && (
        <button className="admin-toast__close" type="button" aria-label="Dismiss notification" onClick={close}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
};
