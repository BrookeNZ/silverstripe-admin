// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';
import type { ToastType } from './Toast';
import { mount } from './test/render';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('Toast', () => {
  it.each<[ToastType, string]>([
    ['info', 'Information'],
    ['success', 'Success'],
    ['warning', 'Warning'],
    ['error', 'Error'],
  ])('draws the %s icon, named for its type, and no live region role', (type, label) => {
    const toast = mount(<Toast type={type}>Saved</Toast>);
    expect(toast.classList.contains(`admin-toast--${type}`)).toBe(true);
    const icon = toast.querySelector('svg.admin-toast__icon')!;
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe(label);
    expect(toast.getAttribute('role')).toBeNull();
    expect(toast.querySelector('.admin-toast__message')?.textContent).toBe('Saved');
  });

  it('defaults to info', () => {
    const toast = mount(<Toast>Note</Toast>);
    expect(toast.classList.contains('admin-toast--info')).toBe(true);
  });

  it('draws no close button without onClose, and one that closes it with', () => {
    expect(mount(<Toast>Note</Toast>).querySelector('button')).toBeNull();
    const onClose = vi.fn();
    const toast = mount(<Toast onClose={onClose}>Note</Toast>);
    const close = toast.querySelector('button')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss notification');
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(toast.isConnected).toBe(false);
  });

  it('closes itself after dismissAfter', () => {
    const onClose = vi.fn();
    const toast = mount(
      <Toast type="success" dismissAfter={1000} onClose={onClose}>
        Saved
      </Toast>,
    );
    advance(999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledOnce();
    expect(toast.isConnected).toBe(false);
  });

  it('keeps its timer when the owner re-renders with a fresh onClose', () => {
    const closed = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const draw = () => act(() => root.render(<Toast dismissAfter={1000} onClose={() => closed()}>Saved</Toast>));
    draw();
    advance(600);
    draw();
    advance(400);
    expect(closed).toHaveBeenCalledOnce();
    act(() => root.unmount());
    container.remove();
  });

  it('closes itself without an owner when only dismissAfter is set', () => {
    const toast = mount(<Toast dismissAfter={1000}>Note</Toast>);
    advance(1000);
    expect(toast.isConnected).toBe(false);
  });

  it('pauses while hovered', () => {
    const onClose = vi.fn();
    const toast = mount(
      <Toast dismissAfter={1000} onClose={onClose}>
        Note
      </Toast>,
    );
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

  it('pauses while focused', () => {
    const onClose = vi.fn();
    const toast = mount(
      <Toast dismissAfter={1000} onClose={onClose}>
        Note
      </Toast>,
    );
    const close = toast.querySelector('button')!;
    act(() => close.focus());
    advance(5000);
    expect(onClose).not.toHaveBeenCalled();
    act(() => close.blur());
    advance(1000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps an error until it is dismissed', () => {
    const onClose = vi.fn();
    const toast = mount(
      <Toast type="error" dismissAfter={1000} onClose={onClose}>
        Failed
      </Toast>,
    );
    advance(60000);
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.isConnected).toBe(true);
  });

  it('does not take focus when it appears', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    mount(<Toast onClose={() => {}}>Note</Toast>);
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});

describe('toast motion', () => {
  const css = (name: string) => readFileSync(join(import.meta.dirname, 'css', name), 'utf8');
  // happy-dom drops a whole rule that nests an at-rule, so the nested blocks go before it parses the sheet
  const unnested = (sheet: string) => sheet.replace(/\n {2}@[^{]+\{[^}]*\}\n/g, '\n');
  const device = (window as unknown as { happyDOM: { settings: { device: { prefersReducedMotion: string } } } }).happyDOM.settings.device;

  const animationWhen = (preference: string) => {
    device.prefersReducedMotion = preference;
    const style = document.createElement('style');
    style.textContent = css('tokens.css') + unnested(css('toast.css'));
    document.head.append(style);
    const toast = mount(<Toast>Saved</Toast>);
    const animation = getComputedStyle(toast).getPropertyValue('animation');
    style.remove();
    return animation;
  };

  afterEach(() => {
    device.prefersReducedMotion = 'no-preference';
  });

  it('fades in, and not under reduced motion', () => {
    expect(animationWhen('no-preference')).toMatch(/^admin-fade-in /);
    expect(animationWhen('reduce')).toBe('none');
  });
});
