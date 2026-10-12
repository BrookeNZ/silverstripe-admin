/**
 * The details panel's content, held in Piral global state and set through the Pilet API's `openPanel`. One
 * panel shows at a time: opening another id replaces the one showing without calling its `onClose`, since
 * the replacement is the caller's own doing (a second file opened from the list), and opening the id that
 * is showing updates it in place, so a page can push a fresh title or meta line without moving focus.
 * `closePanel`, the disposer `openPanel` returns and unloading the owning pilet remove it; none of them
 * call `onClose`, which is only the user pressing the close button.
 *
 * The disposer closes a microtask later, and only if nothing has opened the same id since, so a page that
 * reopens from an effect (cleanup, then the new call) updates the panel rather than closing and reopening it.
 */
import type * as React from 'react';
import type { Disposable, GlobalStateContext } from 'piral-core';
import { useGlobalState } from 'piral-core';

export interface PanelOptions {
  /** Names the panel to `closePanel` and `usePanel`; opening the id already showing updates it in place */
  id: string;
  /** The panel's heading and accessible name */
  title: string;
  /** A short status beside the title, drawn as the site tree's tag ("Draft") */
  badge?: string;
  /** Facts under the title, divided by rules ("1120 x 640px", "13 KB") */
  meta?: ReadonlyArray<string>;
  /** Scrolls on its own; a FormSchemaForm here pins its action bar to the panel's foot */
  content: React.ReactNode;
  /** An action bar under the scrolling content, for content without a form of its own */
  footer?: React.ReactNode;
  /** The user pressed the close button. Close the panel from here, usually by navigating */
  onClose: () => void;
  /** The close button's accessible name; "Close <title>" when not given */
  closeLabel?: string;
  /** Where focus goes when the panel closes and the element focused when it opened is gone */
  returnFocus?: () => HTMLElement | null;
}

export interface PanelEntry {
  options: Readonly<PanelOptions>;
  /** The pilet (or "shell") that opened it */
  owner: string;
  /** Changes when a different panel replaces this one, not when the same id updates */
  key: number;
  /** Changes on every open, including an update in place */
  generation: number;
  /** Focused when the panel opened, for returning focus on close */
  opener: HTMLElement | null;
}

export interface PanelState {
  current: PanelEntry | null;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomState {
    panel: PanelState;
  }
}

export const initialPanel: PanelState = { current: null };

let lastKey = 0;
let lastGeneration = 0;

function setCurrent(context: GlobalStateContext, current: PanelEntry | null): void {
  context.dispatch((state) => ({ ...state, panel: { current } }));
}

function readCurrent(context: GlobalStateContext): PanelEntry | null {
  return context.readState((state) => state.panel?.current ?? null);
}

function focusedElement(): HTMLElement | null {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

export function openPanel(context: GlobalStateContext, owner: string, options: PanelOptions): Disposable {
  const showing = readCurrent(context);
  const generation = ++lastGeneration;
  const entry: PanelEntry =
    showing && showing.options.id === options.id && showing.owner === owner
      ? { ...showing, options, generation }
      : { options, owner, key: ++lastKey, generation, opener: focusedElement() };
  setCurrent(context, entry);
  return () => {
    queueMicrotask(() => {
      if (readCurrent(context)?.generation === generation) {
        setCurrent(context, null);
      }
    });
  };
}

export function closePanel(context: GlobalStateContext, owner: string, id: string): void {
  const current = readCurrent(context);
  if (current && current.owner === owner && current.options.id === id) {
    setCurrent(context, null);
  }
}

export function clearPanelOf(context: GlobalStateContext, owner: string): void {
  if (readCurrent(context)?.owner === owner) {
    setCurrent(context, null);
  }
}

export function usePanelEntry(): PanelEntry | null {
  return useGlobalState((state) => state.panel?.current ?? null);
}

export interface OpenPanel {
  id: string;
  title: string;
  owner: string;
}

/** The panel showing, or null; for a page that marks the item the panel shows */
export function usePanel(): OpenPanel | null {
  const entry = usePanelEntry();
  const id = entry?.options.id;
  const title = entry?.options.title;
  const owner = entry?.owner;
  return id !== undefined && title !== undefined && owner !== undefined ? { id, title, owner } : null;
}
