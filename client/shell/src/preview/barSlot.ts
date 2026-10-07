/**
 * Where the action bar draws in preview mode. The section's content, and the form with it, is hidden
 * then but stays mounted, so the preview pane offers an element at its foot and the form renders its
 * bar's right-hand group into it through a portal
 */
import * as React from 'react';

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** A callback ref for the preview pane's bar element */
export function setPreviewBarSlot(element: HTMLElement | null): void {
  if (element === slot) {
    return;
  }
  slot = element;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreviewBarSlot(): HTMLElement | null {
  return React.useSyncExternalStore(subscribe, () => slot);
}
