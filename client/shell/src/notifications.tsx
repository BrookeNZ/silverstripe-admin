/**
 * The shell's notifications: piral-notifications holds the list, the shell draws the host, and each
 * notification is the patterns package's Toast.
 *
 * piral-notifications closes a toast on a plain timer that cannot be paused, so the shell's plugin
 * wrapper hands it autoClose 0 and keeps the delay as `dismissAfter`, which the Toast runs itself: the
 * timer stops while the toast is hovered or holds focus. As legacy did, an error stays until it is
 * dismissed and a warning stays unless the caller passes `autoClose`. Toasts announce their text
 * through the layout's live regions (announcer.tsx), an error assertively, instead of each being its
 * own live region, which screen readers often miss when the element arrives with its text already in it.
 * piral-notifications puts the newest toast first, so it lands nearest the header
 */
import * as React from 'react';
import type { PiletApiExtender } from 'piral-base';
import type { PiralPlugin } from 'piral-core';
import { createNotificationsApi } from 'piral-notifications';
import type { NotificationOptions, NotificationsHostProps, NotificationsToastProps, PiletNotificationsApi } from 'piral-notifications';
import { Toast } from '@silverstripe/admin-patterns';
import { announce } from './announcer';

declare module 'piral-notifications/lib/types' {
  interface PiralCustomNotificationOptions {
    /** Milliseconds the toast stays while not hovered or focused; 0 keeps it until dismissed */
    dismissAfter?: number;
  }
}

/** Legacy's STAY_TIME for a toast that closes itself */
export const defaultDismissAfter = 6000;

export function toastOptions(options: NotificationOptions, dismissAfter: number): NotificationOptions {
  const { autoClose, ...rest } = options;
  const stays = rest.type === 'error' || (rest.type === 'warning' && autoClose === undefined);
  return { ...rest, autoClose: 0, dismissAfter: stays ? 0 : (autoClose ?? dismissAfter) };
}

export function createShellNotificationsApi(dismissAfter = defaultDismissAfter): PiralPlugin<PiletNotificationsApi> {
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
  const toastRef = React.useRef<HTMLDivElement>(null);
  const type = options.type ?? 'info';

  React.useEffect(() => {
    const message = toastRef.current?.querySelector('.admin-toast__message')?.textContent ?? '';
    announce(message, type === 'error' ? 'assertive' : 'polite');
  }, [type]);

  return (
    <Toast ref={toastRef} type={type} dismissAfter={options.dismissAfter} onClose={onClose}>
      {children}
    </Toast>
  );
};
