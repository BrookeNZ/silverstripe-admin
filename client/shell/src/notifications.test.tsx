// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { PiletApi, PiletApiExtender, PiletMetadata } from 'piral-base';
import type { GlobalState } from 'piral-core';
import type { NotificationOptions, PiletNotificationsApi } from 'piral-notifications';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceDelay, LiveAnnouncer } from './announcer';
import { createShellNotificationsApi, defaultDismissAfter, NotificationsHost, NotificationsToast, toastOptions } from './notifications';
import { fakeGlobalContext } from './test/fakeGlobalContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function renderToast(onClose: () => void, options: NotificationOptions) {
  act(() =>
    root.render(
      <>
        <LiveAnnouncer />
        <NotificationsToast onClose={onClose} options={options}>
          Saved
        </NotificationsToast>
      </>,
    ),
  );
  return container.querySelector<HTMLElement>('.admin-toast')!;
}

describe('toastOptions', () => {
  it('takes the timer from the library and keeps the delay for the toast', () => {
    expect(toastOptions({ type: 'info' }, 6000)).toEqual({ type: 'info', autoClose: 0, dismissAfter: 6000 });
    expect(toastOptions({ type: 'success', autoClose: 3000 }, 6000)).toEqual({ type: 'success', autoClose: 0, dismissAfter: 3000 });
  });

  it('keeps an error until it is dismissed', () => {
    expect(toastOptions({ type: 'error', autoClose: 3000 }, 6000)).toEqual({ type: 'error', autoClose: 0, dismissAfter: 0 });
  });

  it('keeps a warning unless the caller sets autoClose', () => {
    expect(toastOptions({ type: 'warning' }, 6000)).toEqual({ type: 'warning', autoClose: 0, dismissAfter: 0 });
    expect(toastOptions({ type: 'warning', autoClose: 3000 }, 6000)).toEqual({ type: 'warning', autoClose: 0, dismissAfter: 3000 });
  });
});

describe('NotificationsToast', () => {
  it('closes itself after the delay', () => {
    const onClose = vi.fn();
    renderToast(onClose, { type: 'success', dismissAfter: 1000 });
    advance(1000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pauses while hovered', () => {
    const onClose = vi.fn();
    const toast = renderToast(onClose, { type: 'success', dismissAfter: 1000 });
    act(() => {
      toast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    advance(5000);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      toast.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    advance(1000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('announces its text politely, not as a live region of its own', () => {
    const onClose = vi.fn();
    const toast = renderToast(onClose, { type: 'success', dismissAfter: 0 });
    advance(announceDelay);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Saved');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('');
    expect(toast.getAttribute('role')).toBeNull();
    const close = toast.querySelector('button')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss notification');
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('announces an error assertively', () => {
    renderToast(vi.fn(), { type: 'error', dismissAfter: 0 });
    advance(announceDelay);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Saved');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('reads two toasts that arrive together one after the other', () => {
    act(() =>
      root.render(
        <>
          <LiveAnnouncer />
          <NotificationsToast onClose={vi.fn()} options={{ type: 'success', dismissAfter: 0 }}>
            Saved
          </NotificationsToast>
          <NotificationsToast onClose={vi.fn()} options={{ type: 'info', dismissAfter: 0 }}>
            Published
          </NotificationsToast>
        </>,
      ),
    );
    const region = container.querySelector('[role="status"]');
    advance(announceDelay);
    expect(region?.textContent).toBe('Saved');
    advance(announceDelay * 2);
    expect(region?.textContent).toBe('Published');
  });
});

describe('the shell notifications plugin', () => {
  // Piral's createInstance needs its build-time codegen, so the plugin runs on the fake context and the
  // list renders as piral-notifications' own Notifications component draws it
  function renderPlugin() {
    const context = fakeGlobalContext({ registry: { extensions: {} } } as unknown as Partial<GlobalState>);
    const withActions = context as unknown as Record<string, unknown> & { defineActions: (actions: object) => void };
    withActions.defineActions = (actions) => {
      Object.entries(actions).forEach(([name, action]) => {
        withActions[name] = (...args: Array<unknown>) => action(context, ...args);
      });
    };
    const extend = createShellNotificationsApi()(context) as PiletApiExtender<PiletNotificationsApi>;
    const api = extend({} as PiletApi, {} as PiletMetadata);
    const List = () => {
      const notifications = context.state((state) => state.notifications);
      return (
        <NotificationsHost>
          {notifications.map(({ component: Message, close, options, id }) => (
            <NotificationsToast key={id} onClose={close} options={options}>
              <Message onClose={close} options={options} />
            </NotificationsToast>
          ))}
        </NotificationsHost>
      );
    };
    act(() => root.render(<List />));
    return api;
  }

  const messages = () => [...container.querySelectorAll('.admin-toast__message')].map((message) => message.textContent);

  it('stacks the newest toast first and leaves focus where it was', () => {
    const api = renderPlugin();
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    act(() => {
      api.showNotification('First', { type: 'info' });
    });
    act(() => {
      api.showNotification('Second', { type: 'success' });
    });
    expect(messages()).toEqual(['Second', 'First']);
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('removes timed toasts after the default delay and keeps errors and warnings', () => {
    const api = renderPlugin();
    act(() => {
      api.showNotification('Saved', { type: 'success' });
      api.showNotification('Careful', { type: 'warning' });
      api.showNotification('Failed', { type: 'error' });
    });
    advance(defaultDismissAfter);
    expect(messages()).toEqual(['Failed', 'Careful']);
  });

  it('removes a toast when its close button is pressed', () => {
    const api = renderPlugin();
    act(() => {
      api.showNotification('Failed', { type: 'error' });
    });
    act(() => container.querySelector<HTMLButtonElement>('.admin-toast__close')!.click());
    advance(0);
    expect(messages()).toEqual([]);
  });
});
