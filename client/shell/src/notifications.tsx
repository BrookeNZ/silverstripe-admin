/**
 * The shell's notifications: piral-notifications holds the list, the shell draws the host and toasts.
 *
 * piral-notifications closes a toast on a plain timer that cannot be paused, so the shell's plugin
 * wrapper hands it autoClose 0 and keeps the delay as `dismissAfter`, which the toast runs itself: the
 * timer stops while the toast is hovered or holds focus and starts again when both end. An error stays
 * until it is dismissed. Toasts announce their text through the layout's one live region
 * (announcer.tsx) instead of each being its own status, which screen readers often miss when the
 * element arrives with its text already in it
 */
import * as React from 'react';
import type { PiletApiExtender } from 'piral-base';
import type { PiralPlugin } from 'piral-core';
import { createNotificationsApi } from 'piral-notifications';
import type { NotificationOptions, NotificationsHostProps, NotificationsToastProps, PiletNotificationsApi } from 'piral-notifications';
import { CloseIcon } from '@silverstripe/admin-patterns';
import { announce } from './announcer';

declare module 'piral-notifications/lib/types' {
  interface PiralCustomNotificationOptions {
    /** Milliseconds the toast stays while not hovered or focused; 0 keeps it until dismissed */
    dismissAfter?: number;
  }
}

export function toastOptions(options: NotificationOptions, dismissAfter: number): NotificationOptions {
  const { autoClose, ...rest } = options;
  return { ...rest, autoClose: 0, dismissAfter: rest.type === 'error' ? 0 : (autoClose ?? dismissAfter) };
}

export function createShellNotificationsApi(dismissAfter: number): PiralPlugin<PiletNotificationsApi> {
  const plugin = createNotificationsApi({ defaultOptions: { type: 'info' } });
  return (context) => {
    const extend = plugin(context) as PiletApiExtender<PiletNotificationsApi>;
    return (api, meta) => {
      const { showNotification } = extend(api, meta);
      return {
        showNotification: (content, options = {}) => showNotification(content, toastOptions(options, dismissAfter)),
      };
    };
  };
}

export const NotificationsHost = ({ children }: NotificationsHostProps) => (
  <div className="piral-notifications-host" role="region" aria-label="Notifications">
    {children}
  </div>
);

export const NotificationsToast = ({ children, onClose, options }: NotificationsToastProps) => {
  const messageRef = React.useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const dismissAfter = options.dismissAfter ?? 0;

  React.useEffect(() => {
    announce(messageRef.current?.textContent ?? '');
  }, []);

  React.useEffect(() => {
    if (!dismissAfter || hovered || focused) {
      return undefined;
    }
    const timer = setTimeout(onClose, dismissAfter);
    return () => clearTimeout(timer);
  }, [dismissAfter, hovered, focused, onClose]);

  return (
    <div
      className={`piral-notification piral-notification--${options.type ?? 'info'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => setFocused(event.currentTarget.contains(event.relatedTarget as Node | null))}
    >
      <span className="piral-notification__message" ref={messageRef}>
        {children}
      </span>
      <button className="piral-notification-close" type="button" aria-label="Dismiss notification" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );
};
