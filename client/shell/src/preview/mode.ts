/**
 * The preview pane's mode, shared by the action bar's mode menu and the layout's pane. The choice is
 * the viewer's own and kept in localStorage, which can be missing or throw (private windows, blocked site
 * data), so every read and write falls back to edit mode in memory. Below 1024px, where the menu becomes
 * the top bar, there is no room beside the form and the effective mode is always edit.
 */
import * as React from 'react';
import { useMediaQuery } from '../useMediaQuery';

export type PreviewMode = 'edit' | 'split' | 'preview';

export const previewModes: ReadonlyArray<{ mode: PreviewMode; label: string }> = [
  { mode: 'edit', label: 'Edit mode' },
  { mode: 'split', label: 'Split mode' },
  { mode: 'preview', label: 'Preview mode' },
];

export const previewModeStorageKey = 'shell.previewMode';

// Same breakpoint as the sidebar in style.css
export const previewWideQuery = '(width >= 1024px)';

function isPreviewMode(value: unknown): value is PreviewMode {
  return previewModes.some(({ mode }) => mode === value);
}

function readStoredMode(): PreviewMode {
  try {
    const stored = window.localStorage.getItem(previewModeStorageKey);
    return isPreviewMode(stored) ? stored : 'edit';
  } catch {
    return 'edit';
  }
}

let chosen: PreviewMode | null = null;
const listeners = new Set<() => void>();

export function chosenPreviewMode(): PreviewMode {
  chosen ??= readStoredMode();
  return chosen;
}

export function setPreviewMode(mode: PreviewMode): void {
  chosen = mode;
  try {
    window.localStorage.setItem(previewModeStorageKey, mode);
  } catch {
    // Kept for this page load only
  }
  listeners.forEach((listener) => listener());
}

/** Forgets the in-memory choice so the next read goes back to storage */
export function resetPreviewMode(): void {
  chosen = null;
}

/** The shared state's `viewMode` follows the choice through this */
export function subscribePreviewMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the viewport has room for a preview, and the mode to draw: edit when it has not */
export function usePreviewMode(): { mode: PreviewMode; available: boolean } {
  const mode = React.useSyncExternalStore(subscribePreviewMode, chosenPreviewMode);
  const available = useMediaQuery(previewWideQuery);
  return { mode: available ? mode : 'edit', available };
}
