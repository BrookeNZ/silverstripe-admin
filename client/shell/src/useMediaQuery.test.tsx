// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Probe = ({ query }: { query: string }) => <span>{useMediaQuery(query) ? 'yes' : 'no'}</span>;

describe('useMediaQuery', () => {
  let container: HTMLDivElement;
  let root: Root;
  let matches: boolean;
  let listeners: Set<() => void>;
  let queries: Array<string>;

  beforeEach(() => {
    matches = true;
    listeners = new Set();
    queries = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query);
      return {
        get matches() {
          return matches;
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      };
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('reads the query and follows its change event', () => {
    act(() => root.render(<Probe query="(width >= 1024px)" />));
    expect(container.textContent).toBe('yes');
    expect(queries).toContain('(width >= 1024px)');

    matches = false;
    act(() => listeners.forEach((listener) => listener()));
    expect(container.textContent).toBe('no');
  });

  it('stops listening on unmount', () => {
    act(() => root.render(<Probe query="(width >= 1024px)" />));
    expect(listeners.size).toBe(1);
    act(() => root.render(<span />));
    expect(listeners.size).toBe(0);
  });

  it('reads false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    act(() => root.render(<Probe query="(width >= 1024px)" />));
    expect(container.textContent).toBe('no');
  });

  it('reads false on the server', () => {
    expect(renderToString(<Probe query="(width >= 1024px)" />)).toBe('<span>no</span>');
  });
});
