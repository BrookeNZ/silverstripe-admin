/**
 * This file holds the state of each tree view by `treeId` for the life of the page. A tree that unmounts and mounts
 * again starts in the state that the tree left. The store keeps a response that arrives while the tree is unmounted.
 * Trees mounted with the same `treeId` share one store.
 */
import { useSyncExternalStore } from 'react';
import treeViewReducer, { initialTreeState } from './TreeViewReducer';

// The store of each tree view by `treeId`, exported for tests to clear.
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

// Return the value that `select` picks from the state of `store`. `select` must return the same value for the same
// state. A new object or array on each call re-renders the component without end.
export function useTreeValue(store, select) {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
