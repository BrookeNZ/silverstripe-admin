import ACTION_TYPES from './TreeViewActionTypes';
import { STATUS, isLoading, storedAncestorIds } from './TreeViewReducer';

export function fetchChildrenRequest(parentId) {
  return {
    type: ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_REQUEST,
    payload: { parentId },
  };
}

export function fetchChildrenSuccess(parentId, nodes) {
  return {
    type: ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_SUCCESS,
    payload: { parentId, nodes },
  };
}

export function fetchChildrenFailure(parentId) {
  return {
    type: ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_FAILURE,
    payload: { parentId },
  };
}

export function expandNode(id) {
  return {
    type: ACTION_TYPES.TREEVIEW_EXPAND_NODE,
    payload: { id },
  };
}

export function collapseNode(id) {
  return {
    type: ACTION_TYPES.TREEVIEW_COLLAPSE_NODE,
    payload: { id },
  };
}

export function setScroll(scrollTop) {
  return {
    type: ACTION_TYPES.TREEVIEW_SET_SCROLL,
    payload: { scrollTop },
  };
}

export function revealRequest(id) {
  return {
    type: ACTION_TYPES.TREEVIEW_REVEAL_REQUEST,
    payload: { id },
  };
}

// `ids` are the ancestors of the node `id`, top level first
export function revealSuccess(id, ids) {
  return {
    type: ACTION_TYPES.TREEVIEW_REVEAL_SUCCESS,
    payload: { id, ids },
  };
}

export function reloadRequest(reloadKey) {
  return {
    type: ACTION_TYPES.TREEVIEW_RELOAD,
    payload: { reloadKey },
  };
}

// `fetchChildren` is `(parentId) => Promise` of node data. A failed fetch or a response that is not a list of objects
// marks the parent failed instead of rejecting. `force` loads a loaded or failed list again
export async function loadChildren(dispatch, getState, parentId, fetchChildren, { force = false } = {}) {
  const tree = getState();
  const parent = tree.nodes[parentId];
  if (
    isLoading(tree, parentId)
    || (parent && parent.limited)
    || (!force && (tree.childIds[parentId] || tree.status[parentId] === STATUS.FAILED))
  ) {
    return;
  }

  dispatch(fetchChildrenRequest(parentId));
  let children = null;
  try {
    children = await fetchChildren(parentId);
  } catch (error) {
    children = null;
  }
  const isNodeList = Array.isArray(children) && children.every((node) => node !== null && typeof node === 'object');
  dispatch(isNodeList ? fetchChildrenSuccess(parentId, children) : fetchChildrenFailure(parentId));
}

// Fetches each list kept on screen again, and resolves once those responses are in. A list already loading is left
// to its own request
export async function reloadTree(dispatch, getState, reloadKey, fetchChildren) {
  dispatch(reloadRequest(reloadKey));
  const ids = Object.keys(getState().childIds).map(Number);
  await Promise.all(ids.map((id) => loadChildren(dispatch, getState, id, fetchChildren, { force: true })));
}

// `fetchPath` is `(id) => Promise` of the node's ancestor ids, top level first. Only the latest reveal opens a
// path; a null id records that no page is revealed
export async function revealNode(dispatch, getState, id, fetchPath) {
  dispatch(revealRequest(id));
  if (id === null) {
    return;
  }
  const storedIds = storedAncestorIds(getState(), id);
  if (storedIds) {
    dispatch(revealSuccess(id, storedIds));
    return;
  }
  if (typeof fetchPath !== 'function') {
    return;
  }
  try {
    const path = await fetchPath(id);
    if (Array.isArray(path)) {
      dispatch(revealSuccess(id, path));
    }
  } catch (error) {
    // A path that cannot be fetched stays closed
  }
}
