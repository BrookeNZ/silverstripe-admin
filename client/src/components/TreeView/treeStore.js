/**
 * Holds the state of each tree view by tree id for the life of the page, so a tree that unmounts and mounts again
 * starts where it was, and a response that arrives while it is unmounted is kept. Trees mounted with the same id
 * share their state.
 */
import { useSyncExternalStore } from 'react';
import treeViewReducer, { initialTreeState } from './TreeViewReducer';

// Exported so tests can clear it
export const treeStores = new Map();

function createStore() {
  let state = initialTreeState;
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch: (action) => {
      const next = treeViewReducer(state, action);
      if (next !== state) {
        state = next;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function getTreeStore(treeId) {
  if (!treeStores.has(treeId)) {
    treeStores.set(treeId, createStore());
  }
  return treeStores.get(treeId);
}

export function useTreeValue(store, select) {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
