import { isLoading, storedAncestorIds } from './TreeViewReducer';

// `fetchChildren` is `(parentId) => Promise` of node data. A failed fetch or a response that is not a list of objects
// marks the parent failed instead of rejecting
export async function loadChildren(store, parentId, fetchChildren) {
  const tree = store.getState();
  const parent = tree.nodes[parentId];
  if (isLoading(tree, parentId) || (parent && parent.limited)) {
    return;
  }

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

// Fetches each list kept on screen again, and resolves once those responses are in. A list already loading is left
// to its own request
export async function reloadTree(store, reloadKey, fetchChildren) {
  store.dispatch({ type: 'reloadRequest', reloadKey });
  const ids = Object.keys(store.getState().childIds).map(Number);
  await Promise.all(ids.map((id) => loadChildren(store, id, fetchChildren)));
}

// `fetchPath` is `(id) => Promise` of the node's ancestor ids, top level first. Only the latest reveal opens a
// path; a null id records that no page is revealed
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
    // A path that cannot be fetched stays closed
  }
}
