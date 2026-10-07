/**
 * Publishes an element's rendered height as a custom property on the root element, for the sticky
 * section header and the form's action bar: the scroll padding, the pages tree pane and the toast host
 * read the real height rather than a design height that a wrapped bar or a header without views
 * would get wrong. With several measured elements on one token (a form in a dialog over the page) the
 * tallest wins; with none left the property is removed and the stylesheet's design height applies.
 */
import * as React from 'react';

const heights = new Map<string, Map<symbol, number>>();

function publish(token: string): void {
  const measured = heights.get(token);
  if (!measured || measured.size === 0) {
    document.documentElement.style.removeProperty(token);
    return;
  }
  document.documentElement.style.setProperty(token, `${Math.max(...measured.values())}px`);
}

function record(token: string, key: symbol, height: number | null): void {
  const measured = heights.get(token) ?? new Map<symbol, number>();
  heights.set(token, measured);
  if (height === null) {
    measured.delete(key);
  } else {
    measured.set(key, height);
  }
  publish(token);
}

/** A callback ref that keeps `token` on the root element at the height of the element it is given */
export function useMeasuredHeight<T extends HTMLElement>(token: string): (node: T | null) => void {
  const key = React.useRef(Symbol(token)).current;
  const observer = React.useRef<ResizeObserver | null>(null);
  return React.useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node) {
        record(token, key, null);
        return;
      }
      const measure = () => record(token, key, node.getBoundingClientRect().height);
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer.current = new ResizeObserver(measure);
        observer.current.observe(node);
      }
    },
    [token, key],
  );
}
