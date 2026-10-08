// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewModeMenuId, PreviewModeMenu } from './PreviewModeMenu';
import { previewModeStorageKey, resetPreviewMode, usePreviewMode } from './mode';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wide = true;
let container: HTMLDivElement;
let root: Root;

const Probe = () => {
  const { mode } = usePreviewMode();
  return (
    <>
      <PreviewModeMenu mode={mode} />
      <output>{mode}</output>
    </>
  );
};

function render() {
  act(() => root.render(<Probe />));
}

function choose(label: string) {
  act(() => document.getElementById(previewModeMenuId)?.click());
  const item = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
    (button) => button.textContent === label,
  );
  act(() => item?.click());
}

const shown = () => container.querySelector('output')?.textContent;

beforeEach(() => {
  wide = true;
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: () => undefined, removeEventListener: () => undefined }));
  window.localStorage.clear();
  resetPreviewMode();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('preview mode', () => {
  it('switches mode from the menu, remembers it per viewer and falls back to edit on a narrow viewport', () => {
    render();
    expect(shown()).toBe('edit');

    choose('Split mode');
    expect(shown()).toBe('split');
    expect(window.localStorage.getItem(previewModeStorageKey)).toBe('split');

    choose('Preview mode');
    expect(shown()).toBe('preview');
    expect(document.getElementById(previewModeMenuId)?.textContent).toBe('Preview mode');

    resetPreviewMode();
    act(() => root.unmount());
    root = createRoot(container);
    wide = false;
    render();
    expect(shown()).toBe('edit');
  });
});
