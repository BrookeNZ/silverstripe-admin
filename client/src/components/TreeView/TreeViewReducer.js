import deepFreeze from 'deep-freeze-strict';
import ACTION_TYPES from './TreeViewActionTypes';

export const STATUS = {
  LOADING: 'loading',
  FAILED: 'failed',
};

// Top-level nodes are listed under 0, which also stands for the root row in expand and collapse
export const ROOT_ID = 0;

export const initialTreeState = deepFreeze({
  nodes: {},
  childIds: {},
  status: {},
  expanded: [],
  rootCollapsed: false,
  scrollTop: 0,
  revealedId: null,
  revealing: false,
  reloadKey: null,
});

function omitKeys(object, keys) {
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(object, key));
  if (!present.length) {
    return object;
  }
  const result = { ...object };
  present.forEach((key) => {
    delete result[key];
  });
  return result;
}

function updateTree(tree, changes) {
  const changed = Object.keys(changes).some((key) => changes[key] !== tree[key]);
  return changed ? { ...tree, ...changes } : tree;
}

function withoutId(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : list;
}

function addOnce(list, ids) {
  return ids.reduce((result, id) => (result.includes(id) ? result : [...result, id]), list);
}

export function isLoading(tree, parentId) {
  return tree.status[parentId] === STATUS.LOADING;
}

// The node's ancestor ids, top level first, or null unless each page up to the top level is in its parent's loaded
// list, as a page moved on the server since it was stored may be in none
export function storedAncestorIds({ nodes, childIds }, id) {
  const ancestorIds = [];
  let childId = id;
  let node = nodes[id];
  while (node) {
    const siblingIds = childIds[node.parentId];
    if (!siblingIds || !siblingIds.includes(childId)) {
      return null;
    }
    if (node.parentId === ROOT_ID) {
      return ancestorIds;
    }
    if (ancestorIds.includes(node.parentId)) {
      return null;
    }
    ancestorIds.unshift(node.parentId);
    childId = node.parentId;
    node = nodes[childId];
  }
  return null;
}

export function isShown(tree, id, isRootOpen = true) {
  const ancestorIds = storedAncestorIds(tree, id);
  return Boolean(ancestorIds) && isRootOpen && ancestorIds.every((ancestorId) => tree.expanded.includes(ancestorId));
}

function receiveChildren(tree, parentId, received) {
  const nodes = { ...tree.nodes };
  const childIds = { ...tree.childIds };
  received.forEach((node) => {
    // A node moved on the server since it was stored leaves its old list, so no row is drawn twice
    const previous = nodes[node.id];
    if (previous && previous.parentId !== parentId && childIds[previous.parentId]) {
      childIds[previous.parentId] = withoutId(childIds[previous.parentId], node.id);
    }
    nodes[node.id] = { ...node, parentId };
  });
  childIds[parentId] = received.map((node) => node.id);

  return {
    ...tree,
    nodes,
    childIds,
    status: omitKeys(tree.status, [parentId]),
  };
}

function receivePath(tree, id, ancestorIds) {
  // A page added since its parent loaded is missing from the parent's list, which is dropped to load again
  const path = [ROOT_ID, ...ancestorIds.filter((ancestorId) => ancestorId !== ROOT_ID), id];
  const staleIds = path.slice(0, -1).filter((parentId, index) => (
    tree.childIds[parentId] && !tree.childIds[parentId].includes(path[index + 1])
  ));
  return updateTree(tree, {
    childIds: omitKeys(tree.childIds, staleIds),
    rootCollapsed: false,
    expanded: addOnce(tree.expanded, path.slice(1, -1)),
    revealing: false,
  });
}

// Keeps the top level and each list shown under an expanded parent; the rest load again when next shown
function reload(tree, reloadKey) {
  const isKept = (id) => id === ROOT_ID || (tree.expanded.includes(id) && isShown(tree, id));
  const droppedIds = Object.keys(tree.childIds).filter((id) => !isKept(Number(id)));
  const failedIds = Object.keys(tree.status).filter((id) => !isLoading(tree, id));
  return updateTree(tree, {
    reloadKey,
    childIds: omitKeys(tree.childIds, droppedIds),
    status: omitKeys(tree.status, failedIds),
  });
}

function reduceTree(tree, type, payload) {
  switch (type) {
    case ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_REQUEST:
      return isLoading(tree, payload.parentId)
        ? tree
        : { ...tree, status: { ...tree.status, [payload.parentId]: STATUS.LOADING } };

    case ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_SUCCESS:
      return isLoading(tree, payload.parentId) ? receiveChildren(tree, payload.parentId, payload.nodes) : tree;

    case ACTION_TYPES.TREEVIEW_FETCH_CHILDREN_FAILURE:
      if (!isLoading(tree, payload.parentId)) {
        return tree;
      }
      // A list that fails to load again keeps its rows
      return tree.childIds[payload.parentId]
        ? { ...tree, status: omitKeys(tree.status, [payload.parentId]) }
        : { ...tree, status: { ...tree.status, [payload.parentId]: STATUS.FAILED } };

    case ACTION_TYPES.TREEVIEW_EXPAND_NODE:
      return payload.id === ROOT_ID
        ? updateTree(tree, { rootCollapsed: false })
        : updateTree(tree, { expanded: addOnce(tree.expanded, [payload.id]) });

    case ACTION_TYPES.TREEVIEW_COLLAPSE_NODE:
      return payload.id === ROOT_ID
        ? updateTree(tree, { rootCollapsed: true })
        : updateTree(tree, { expanded: withoutId(tree.expanded, payload.id) });

    case ACTION_TYPES.TREEVIEW_SET_SCROLL:
      return updateTree(tree, { scrollTop: payload.scrollTop });

    case ACTION_TYPES.TREEVIEW_REVEAL_REQUEST:
      return updateTree(tree, { revealedId: payload.id, revealing: payload.id !== null });

    case ACTION_TYPES.TREEVIEW_REVEAL_SUCCESS:
      return tree.revealing && tree.revealedId === payload.id ? receivePath(tree, payload.id, payload.ids) : tree;

    case ACTION_TYPES.TREEVIEW_RELOAD:
      return reload(tree, payload.reloadKey);

    default:
      return tree;
  }
}

export default function treeViewReducer(tree = initialTreeState, action = {}) {
  const next = reduceTree(tree, action.type, action.payload || {});
  return next === tree ? tree : deepFreeze(next);
}
