/**
 * A stand-in for Piral's global state context in tests, since Piral's createInstance needs its build-time
 * codegen: a zustand store holding the shell's slices, and an event bus that records every `emit` in
 * `emitted`. A dispatch that returns the same state notifies no one, as Piral's does, which the shared
 * state tests' render and subscriber counts depend on.
 */
import type { GlobalState, GlobalStateContext } from 'piral-core';
import create from 'zustand';
import { initialSectionHeader } from '../header/state';
import { initialCurrentRecord } from '../state/sharedState';
import { initialUnsavedChanges } from '../unsaved';

type Listener = (event: unknown) => void;

export type FakeGlobalContext = GlobalStateContext & { emitted: Array<unknown> };

export function fakeGlobalContext(initial: Partial<GlobalState> = {}): FakeGlobalContext {
  const store = create<GlobalState>(
    () =>
      ({
        sectionHeader: initialSectionHeader,
        unsavedChanges: initialUnsavedChanges,
        currentRecord: initialCurrentRecord,
        ...initial,
      }) as GlobalState,
  );
  const listeners = new Map<string, Set<Listener>>();
  const emitted: Array<unknown> = [];
  const context = {
    state: store,
    emitted,
    dispatch: (update: (current: GlobalState) => GlobalState) => {
      const state = store.getState();
      const next = update(state);
      if (next !== state) {
        store.setState(next, true);
      }
    },
    readState: <S>(select: (current: GlobalState) => S) => select(store.getState()),
    on: (name: string, listener: Listener) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
      return context;
    },
    off: (name: string, listener: Listener) => {
      listeners.get(name)?.delete(listener);
      return context;
    },
    emit: (name: string, event: unknown) => {
      emitted.push(event);
      listeners.get(name)?.forEach((listener) => listener(event));
      return context;
    },
  } as unknown as FakeGlobalContext;
  return context;
}
