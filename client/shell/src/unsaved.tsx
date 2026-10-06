/**
 * Unsaved changes: one registry in Piral global state that forms report their dirty state into, and the
 * guard that reads it. The guard blocks client-side navigation with useBlocker (the shell runs a data
 * router) and asks in the patterns package's UnsavedChangesDialog; full page loads get the browser's own beforeunload prompt, whose
 * text browsers no longer let a page set.
 *
 * Replaces the legacy jquery.changetracker and the unsavedForms reducer. Keys are owned: the shell reports under "shell", a pilet under its own name,
 * so unloading a pilet clears whatever it left dirty.
 */
import * as React from 'react';
import { useBlocker, useHref, useLocation, useNavigate } from 'react-router-dom';
import type { Disposable, GlobalStateContext } from 'piral-core';
import { useGlobalState } from 'piral-core';
import { UnsavedChangesDialog } from '@silverstripe/admin-patterns';

export interface UnsavedChangesState {
  /** Dirty keys, each mapped to the pilet (or "shell") that reported it */
  dirty: Readonly<Record<string, string>>;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomState {
    unsavedChanges: UnsavedChangesState;
  }
}

export const shellOwner = 'shell';

export const initialUnsavedChanges: UnsavedChangesState = { dirty: {} };

function ownedKey(owner: string, key: string): string {
  return `${owner}:${key}`;
}

function writeDirty(context: GlobalStateContext, update: (dirty: Record<string, string>) => Record<string, string>) {
  context.dispatch((state) => ({ ...state, unsavedChanges: { dirty: update({ ...state.unsavedChanges.dirty }) } }));
}

export function setUnsavedChanges(context: GlobalStateContext, owner: string, key: string, dirty: boolean): Disposable {
  const id = ownedKey(owner, key);
  const clear = () =>
    writeDirty(context, (entries) => {
      delete entries[id];
      return entries;
    });
  if (dirty) {
    writeDirty(context, (entries) => ({ ...entries, [id]: owner }));
  } else {
    clear();
  }
  return clear;
}

export function clearUnsavedChangesOf(context: GlobalStateContext, owner: string): void {
  writeDirty(context, (entries) => Object.fromEntries(Object.entries(entries).filter(([, by]) => by !== owner)));
}

export function hasUnsavedChanges(context: GlobalStateContext): boolean {
  return context.readState((state) => Object.keys(state.unsavedChanges.dirty).length > 0);
}

export function useHasUnsavedChanges(): boolean {
  return useGlobalState((state) => Object.keys(state.unsavedChanges.dirty).length > 0);
}

export const UnsavedChangesGuard = () => {
  const dirty = useHasUnsavedChanges();
  const blocker = useBlocker(
    React.useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
      [dirty],
    ),
  );

  React.useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome before 119 and Safari only prompt when returnValue is set
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const location = useLocation();
  const href = useHref(location);
  const navigate = useNavigate();
  const stay = () => {
    blocker.reset?.();
    // A second Back while the dialog is open moves the address bar past the entry the router restored
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== href) {
      navigate(location, { replace: true });
    }
  };

  return <UnsavedChangesDialog open={blocker.state === 'blocked'} onStay={stay} onLeave={() => blocker.proceed?.()} />;
};
