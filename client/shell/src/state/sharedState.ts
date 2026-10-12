/**
 * Shared state: one read-only view over Piral global state that pilets select from with
 * `useSharedState` (a React hook on useSyncExternalStore) or `subscribeSharedState` (outside React).
 * Writes stay behind named verbs (`setSectionHeader`, `setUnsavedChanges`, `setCurrentRecord`), so
 * every value has an owner and unloading a pilet clears what it set.
 *
 * The view is rebuilt only when the global state object changes, and each part keeps its reference
 * while its source does, so a selector returning a part re-renders only when that part changes. A
 * selector deriving a new object re-renders on every global state change but never loops.
 *
 * Server data does not live here: the server cache sits beside this as its own Pilet API plugin and
 * shares only the records-changed event (events.ts) with it.
 */
import * as React from 'react';
import type { Disposable, GlobalState, GlobalStateContext } from 'piral-core';
import type { NotificationOptions, OpenNotification } from 'piral-notifications';
import type { SectionHeader } from '../header/state';
import { chosenPreviewMode } from '../preview/mode';
import type { PreviewMode } from '../preview/mode';
import type { SilverstripeClientConfig } from '../silverstripe';

/** The record the showing page edits */
export interface CurrentRecord {
  recordClass: string;
  id: number;
}

export interface SharedToast {
  id: string;
  options: Readonly<NotificationOptions>;
}

export interface SharedState {
  /** The same frozen object `getConfig` returns */
  config: Readonly<SilverstripeClientConfig>;
  /** The open toasts, oldest first */
  toasts: ReadonlyArray<SharedToast>;
  /** Whether anything has reported unsaved changes */
  unsavedChanges: boolean;
  /** The preview mode the viewer chose; a viewport too narrow for a preview still draws edit */
  viewMode: PreviewMode;
  header: Readonly<SectionHeader> | null;
  currentRecord: Readonly<CurrentRecord> | null;
}

export type SharedStateSelector<T> = (state: SharedState) => T;

export type SharedStateListener<T> = (value: T, previous: T) => void;

export interface CurrentRecordEntry {
  record: Readonly<CurrentRecord>;
  id: number;
  /** The pilet (or "shell") that set it */
  owner: string;
}

export interface CurrentRecordState {
  /** The last entry's record */
  current: Readonly<CurrentRecord> | null;
  /** Oldest first, so a nested page disposing its record restores the one below */
  entries: ReadonlyArray<CurrentRecordEntry>;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomState {
    currentRecord: CurrentRecordState;
    viewMode: PreviewMode;
  }
}

export const initialCurrentRecord: CurrentRecordState = { current: null, entries: [] };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

let frozenConfig: Readonly<SilverstripeClientConfig> | undefined;

export function sharedConfig(): Readonly<SilverstripeClientConfig> {
  frozenConfig ??= deepFreeze(structuredClone(window.ss.config));
  return frozenConfig;
}

/** Forgets the frozen config so the next read copies `window.ss.config` again */
export function resetSharedConfig(): void {
  frozenConfig = undefined;
}

const noToasts: ReadonlyArray<SharedToast> = Object.freeze([]);
const toastViews = new WeakMap<ReadonlyArray<OpenNotification>, ReadonlyArray<SharedToast>>();
const views = new WeakMap<GlobalState, SharedState>();

function toastsOf(notifications: ReadonlyArray<OpenNotification> | undefined): ReadonlyArray<SharedToast> {
  if (!notifications || notifications.length === 0) {
    return noToasts;
  }
  let toasts = toastViews.get(notifications);
  if (!toasts) {
    toasts = Object.freeze(notifications.map(({ id, options }) => Object.freeze({ id, options })));
    toastViews.set(notifications, toasts);
  }
  return toasts;
}

export function sharedStateOf(state: GlobalState): SharedState {
  let view = views.get(state);
  if (!view) {
    view = Object.freeze({
      config: sharedConfig(),
      toasts: toastsOf(state.notifications),
      unsavedChanges: Object.keys(state.unsavedChanges?.dirty ?? {}).length > 0,
      viewMode: state.viewMode ?? chosenPreviewMode(),
      header: state.sectionHeader?.current ?? null,
      currentRecord: state.currentRecord?.current ?? null,
    });
    views.set(state, view);
  }
  return view;
}

export function readSharedState<T>(context: GlobalStateContext, selector: SharedStateSelector<T>): T {
  return selector(sharedStateOf(context.state.getState()));
}

/** Calls `listener` with the selected value each time it changes (compared with Object.is), not at once */
export function subscribeSharedState<T>(
  context: GlobalStateContext,
  selector: SharedStateSelector<T>,
  listener: SharedStateListener<T>,
): Disposable {
  let previous = readSharedState(context, selector);
  return context.state.subscribe(() => {
    const next = readSharedState(context, selector);
    if (!Object.is(next, previous)) {
      const before = previous;
      previous = next;
      listener(next, before);
    }
  });
}

export function createUseSharedState(context: GlobalStateContext): <T>(selector: SharedStateSelector<T>) => T {
  return function useSharedState<T>(selector: SharedStateSelector<T>): T {
    const cache = React.useRef<{ state: GlobalState; selector: SharedStateSelector<T>; value: T } | null>(null);
    const getSnapshot = () => {
      const state = context.state.getState();
      const cached = cache.current;
      if (cached && cached.state === state && cached.selector === selector) {
        return cached.value;
      }
      const next = selector(sharedStateOf(state));
      const value = cached && Object.is(cached.value, next) ? cached.value : next;
      cache.current = { state, selector, value };
      return value;
    };
    return React.useSyncExternalStore(context.state.subscribe, getSnapshot);
  };
}

let lastRecordId = 0;

function withRecords(context: GlobalStateContext, update: (entries: ReadonlyArray<CurrentRecordEntry>) => ReadonlyArray<CurrentRecordEntry>) {
  context.dispatch((state) => {
    const entries = update(state.currentRecord?.entries ?? []);
    return { ...state, currentRecord: { current: entries[entries.length - 1]?.record ?? null, entries } };
  });
}

export function setCurrentRecord(context: GlobalStateContext, owner: string, record: CurrentRecord): Disposable {
  const id = ++lastRecordId;
  const frozen = Object.freeze({ recordClass: record.recordClass, id: record.id });
  withRecords(context, (entries) => [...entries, { record: frozen, id, owner }]);
  return () => {
    if (context.readState((state) => state.currentRecord?.entries.some((entry) => entry.id === id))) {
      withRecords(context, (entries) => entries.filter((entry) => entry.id !== id));
    }
  };
}

export function clearCurrentRecordOf(context: GlobalStateContext, owner: string): void {
  if (context.readState((state) => state.currentRecord?.entries.some((entry) => entry.owner === owner))) {
    withRecords(context, (entries) => entries.filter((entry) => entry.owner !== owner));
  }
}

export function setViewMode(context: GlobalStateContext, mode: PreviewMode): void {
  context.dispatch((state) => (state.viewMode === mode ? state : { ...state, viewMode: mode }));
}
