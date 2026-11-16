import { isLoading, storedAncestorIds } from './TreeViewReducer';

// The requests in flight, by store and then by parent id. A caller can then wait for a request that another call
// started.
const pendingRequests = new WeakMap();

async function requestChildren(store, parentId, fetchChildren) {
  store.dispatch({ type: 'fetchChildrenRequest', parentId });
  let children = null;
  try {
    children = await fetchChildren(parentId);
  } catch (error) {
    children = null;
  }
  const isNodeList = Array.isArray(children) && children.every((node) => node !== null && typeof node === 'object');
  store.dispatch(isNodeList
    ? { type: 'fetchChildrenSuccess', parentId, nodes: children }
    : { type: 'fetchChildrenFailure', parentId });
}

// Fetch the children of a parent. Dispatch `fetchChildrenFailure` for a failed fetch or a response that is not a list
// of objects. For a parent that is already loading, return the promise of the request in flight. Never reject.
export function loadChildren(store, parentId, fetchChildren) {
  const tree = store.getState();
  const parent = tree.nodes[parentId];
  const requests = pendingRequests.get(store) || new Map();
  const pending = requests.get(parentId);
  if (isLoading(tree, parentId)) {
    return pending || Promise.resolve();
  }
  // The store no longer waits for `pending`. The reducer ignores the response to `pending`. This call then fetches the
  // children again.
  if (pending) {
    return pending.then(() => loadChildren(store, parentId, fetchChildren));
  }
  if (parent && parent.limited) {
    return Promise.resolve();
  }

  const request = requestChildren(store, parentId, fetchChildren).finally(() => requests.delete(parentId));
  requests.set(parentId, request);
  pendingRequests.set(store, requests);
  return request;
}

// Fetch again every list that `reload()` in TreeViewReducer.js keeps. Resolve after every response is in. Wait for a
// list that is already loading, with no second fetch.
export async function reloadTree(store, reloadKey, fetchChildren) {
  store.dispatch({ type: 'reloadRequest', reloadKey });
  const keptParentIds = Object.keys(store.getState().childIds).map(Number);
  await Promise.all(keptParentIds.map((id) => loadChildren(store, id, fetchChildren)));
}

// Reveal the node `id`. Fetch the ancestor ids when the stored ancestors are not complete. Only the latest reveal
// expands ancestors. A null `id` records that no node is revealed.
export async function revealNode(store, id, fetchPath) {
  store.dispatch({ type: 'revealRequest', id });
  if (id === null) {
    return;
  }
  const storedIds = storedAncestorIds(store.getState(), id);
  if (storedIds) {
    store.dispatch({ type: 'revealSuccess', id, ids: storedIds });
    return;
  }
  if (typeof fetchPath !== 'function') {
    return;
  }
  try {
    const path = await fetchPath(id);
    if (Array.isArray(path)) {
      store.dispatch({ type: 'revealSuccess', id, ids: path });
    }
  } catch (error) {
    // A node whose ancestor ids fail to load stays unrevealed.
  }
}

// Track the open request for the node `id` from `request`, the return of `onOpen`. The `onOpen` prop in TreeView.js
// documents each kind of return.
export async function trackOpen(store, id, request) {
  if (request === false) {
    return;
  }
  store.dispatch({ type: 'openRequest', id });
  // The function reads `openCount` straight after the dispatch. The value is then the number of this open request.
  const { openCount } = store.getState();
  if (!request || typeof request.then !== 'function') {
    return;
  }
  let opened = null;
  try {
    opened = await request;
  } catch (error) {
    opened = false;
  }
  if (opened === false) {
    store.dispatch({ type: 'openFailure', openCount });
  }
}
