/**
 * Mounting for the component tests: each element renders into its own container on the body, and every
 * container is removed after the test, or sooner by `unmountAll` when a test renders a variant afresh.
 */
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<HTMLElement> = [];

/** Renders `element` and returns the first element it drew */
export function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  act(() => createRoot(container).render(element));
  return container.firstElementChild as HTMLElement;
}

export function unmountAll(): void {
  mounted.splice(0).forEach((container) => container.remove());
}

afterEach(unmountAll);
