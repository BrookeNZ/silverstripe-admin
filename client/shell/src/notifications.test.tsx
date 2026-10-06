// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceDelay, LiveAnnouncer } from './announcer';
import { NotificationsToast, toastOptions } from './notifications';

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

function renderToast(onClose: () => void, dismissAfter: number) {
  act(() =>
    root.render(
      <>
        <LiveAnnouncer />
        <NotificationsToast onClose={onClose} options={{ type: 'success', dismissAfter }}>
          Saved
        </NotificationsToast>
      </>,
    ),
  );
  return container.querySelector<HTMLElement>('.piral-notification')!;
}

describe('toastOptions', () => {
  it('takes the timer from the library and keeps the delay for the toast', () => {
    expect(toastOptions({ type: 'info' }, 8000)).toEqual({ type: 'info', autoClose: 0, dismissAfter: 8000 });
    expect(toastOptions({ type: 'success', autoClose: 3000 }, 8000)).toEqual({ type: 'success', autoClose: 0, dismissAfter: 3000 });
  });

  it('keeps an error until it is dismissed', () => {
    expect(toastOptions({ type: 'error', autoClose: 3000 }, 8000)).toEqual({ type: 'error', autoClose: 0, dismissAfter: 0 });
  });
});

describe('NotificationsToast', () => {
  it('closes itself after the delay', () => {
    const onClose = vi.fn();
    renderToast(onClose, 1000);
    act(() => vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pauses while hovered', () => {
    const onClose = vi.fn();
    const toast = renderToast(onClose, 1000);
    act(() => toast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })));
    act(() => vi.advanceTimersByTime(5000));
    expect(onClose).not.toHaveBeenCalled();
    act(() => toast.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    act(() => vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pauses while focused', () => {
    const onClose = vi.fn();
    const toast = renderToast(onClose, 1000);
    const close = toast.querySelector('button')!;
    act(() => close.focus());
    act(() => vi.advanceTimersByTime(5000));
    expect(onClose).not.toHaveBeenCalled();
    act(() => close.blur());
    act(() => vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has a named close button and announces its text in the shared live region', () => {
    const onClose = vi.fn();
    const toast = renderToast(onClose, 0);
    act(() => vi.advanceTimersByTime(announceDelay));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Saved');
    expect(toast.getAttribute('role')).toBeNull();
    const close = toast.querySelector('button')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss notification');
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
