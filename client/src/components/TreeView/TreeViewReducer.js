/**
 * This file defines the state of one tree view and `treeViewReducer`, the pure function that changes the state.
 *
 * The comments of the tree view use these terms:
 * - list: a parent's loaded array of child ids.
 * - listed under: held in the list of that parent.
 * - stored ancestors: the chain of `parentId` links in `nodes` from a node up to the top level.
 * - expanded node: a node whose id is in `expanded`.
 * - open row: the row of an expanded node that renders as a parent.
 * - shown node: a node whose row renders.
 * - revealing a node: expanding the ancestors of the node to show the node.
 * - opening a node: loading the node as the current node through the `onOpen` prop of `TreeView`.
 * - open request: a call of `onOpen` from a click on a row, when the call does not return `false`.
 * - pending row: the row just clicked. The pending row stays highlighted until the current node changes or the open
 *   request of the row fails.
 *
 * The state has these fields:
 * - `nodes`: the node data by id, with the fields that the `fetchChildren` prop of `TreeView` lists. The
 *   `parentId` of a node is the parent that the node was last listed under.
 * - `childIds`: the list of each parent by parent id. A parent that is not loaded yet has no entry.
 * - `status`: `STATUS.LOADING` or `STATUS.FAILED` by parent id. A parent that is idle or loaded has no entry.
 * - `expanded`: the ids of the expanded nodes, without the root row.
 * - `rootCollapsed`: whether the root row is collapsed.
 * - `revealedId`: the id of the node that the tree was last asked to reveal, or null.
 * - `revealing`: whether the node `revealedId` still waits for the ancestors of that node to expand. `revealing` stays
 *   true when the ancestor ids cannot be fetched.
 * - `reloadKey`: the `reloadKey` prop of the last reload.
 * - `scrollTop`: the scroll offset of the tree. `TreeView` restores the offset when the tree mounts again.
 * - `pendingId`: the id of the pending row, or null.
 * - `openCount`: the number of open requests started.
 *
 * An action that changes nothing returns the same state object. `createStore()` in treeStore.js then notifies no
 * listener.
 */
import deepFreeze from 'deep-freeze-strict';

export const STATUS = {
  LOADING: 'loading',
  FAILED: 'failed',
};

// The parent id of the top-level nodes. The `expandNode` and `collapseNode` actions also use `ROOT_ID` for the root
// row.
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
  pendingId: null,
  openCount: 0,
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

// Return the ancestor ids of the node `id`, top level first. Return null when a list above the node is not loaded or
// does not hold the next node down. `isMissingFromLoadedPath()` tells the two cases apart.
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

// Check whether the root row is open and every stored ancestor of the node `id` is expanded. A list above the node
// does not need to hold the node.
export function areStoredAncestorsExpanded(tree, id, isRootOpen = true) {
  const parentIds = [];
  let node = tree.nodes[id];
  while (node && node.parentId !== ROOT_ID) {
    if (parentIds.includes(node.parentId) || !tree.expanded.includes(node.parentId)) {
      return false;
    }
    parentIds.push(node.parentId);
    node = tree.nodes[node.parentId];
  }
  return Boolean(node) && isRootOpen;
}

// Check whether every list above the node `id` is loaded and one list no longer holds the next node down. A node
// that passes the check has moved or gone.
export function isMissingFromLoadedPath({ nodes, childIds }, id) {
  const parentIds = [];
  let isMissing = false;
  let childId = id;
  let node = nodes[id];
  while (node) {
    const siblingIds = childIds[node.parentId];
    if (!siblingIds || parentIds.includes(node.parentId)) {
      return false;
    }
    isMissing = isMissing || !siblingIds.includes(childId);
    if (node.parentId === ROOT_ID) {
      return isMissing;
    }
    parentIds.push(node.parentId);
    childId = node.parentId;
    node = nodes[childId];
  }
  return false;
}

function receiveChildren(tree, parentId, received) {
  const nodes = { ...tree.nodes };
  const childIds = { ...tree.childIds };
  const unlimitedIds = [];
  received.forEach((node) => {
    // A node received under a new parent leaves the list of the old parent. Without this step the row renders twice.
    const previous = nodes[node.id];
    if (previous && previous.parentId !== parentId && childIds[previous.parentId]) {
      childIds[previous.parentId] = withoutId(childIds[previous.parentId], node.id);
    }
    // A parent that is no longer limited loses the list and the `status` entry. Both can date from the time when the
    // parent was limited. The children of the parent load when the parent next has an open row.
    if (previous && previous.limited && !node.limited) {
      delete childIds[node.id];
      unlimitedIds.push(node.id);
    }
    nodes[node.id] = { ...node, parentId };
  });
  childIds[parentId] = received.map((node) => node.id);

  return {
    ...tree,
    nodes,
    childIds,
    status: omitKeys(tree.status, [parentId, ...unlimitedIds]),
  };
}

function receivePath(tree, id, ancestorIds) {
  const ancestors = ancestorIds.filter((ancestorId) => ancestorId !== ROOT_ID);
  const path = [ROOT_ID, ...ancestors, id];
  const parentIds = path.slice(0, -1);
  // A list on `path` that lacks the next node on `path` is out of date. The reducer drops that list to load the list
  // again.
  const staleIds = parentIds.filter((parentId, index) => (
    tree.childIds[parentId] && !tree.childIds[parentId].includes(path[index + 1])
  ));
  return updateTree(tree, {
    childIds: omitKeys(tree.childIds, staleIds),
    rootCollapsed: false,
    expanded: addOnce(tree.expanded, ancestors),
    revealing: false,
  });
}

// Keep the top-level list and the list of every expanded node that is shown. Count the root row as open for this
// check. Drop the other lists. Each dropped list loads again when the parent next has an open row.
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

function reduceTree(tree, action) {
  switch (action.type) {
    case 'fetchChildrenRequest':
      return isLoading(tree, action.parentId)
        ? tree
        : { ...tree, status: { ...tree.status, [action.parentId]: STATUS.LOADING } };

    case 'fetchChildrenSuccess':
      return isLoading(tree, action.parentId) ? receiveChildren(tree, action.parentId, action.nodes) : tree;

    case 'fetchChildrenFailure':
      if (!isLoading(tree, action.parentId)) {
        return tree;
      }
      // A list that already has rows keeps the rows when a later load fails.
      return tree.childIds[action.parentId]
        ? { ...tree, status: omitKeys(tree.status, [action.parentId]) }
        : { ...tree, status: { ...tree.status, [action.parentId]: STATUS.FAILED } };

    case 'expandNode':
      return action.id === ROOT_ID
        ? updateTree(tree, { rootCollapsed: false })
        : updateTree(tree, { expanded: addOnce(tree.expanded, [action.id]) });

    case 'collapseNode':
      return action.id === ROOT_ID
        ? updateTree(tree, { rootCollapsed: true })
        : updateTree(tree, { expanded: withoutId(tree.expanded, action.id) });

    case 'setScroll':
      return updateTree(tree, { scrollTop: action.scrollTop });

    // Revealing a different node clears the pending row. Revealing the same node again keeps the pending row, for
    // example after a reload.
    case 'revealRequest':
      return updateTree(tree, {
        revealedId: action.id,
        revealing: action.id !== null,
        pendingId: action.id === tree.revealedId ? tree.pendingId : null,
      });

    // `action.ids` holds the ancestor ids of the node `action.id`, top level first.
    case 'revealSuccess':
      return tree.revealing && tree.revealedId === action.id ? receivePath(tree, action.id, action.ids) : tree;

    case 'reloadRequest':
      return reload(tree, action.reloadKey);

    // The reducer numbers each open request. A failed open request can then tell whether a later open request replaced
    // the failed open request.
    case 'openRequest':
      return { ...tree, pendingId: action.id, openCount: tree.openCount + 1 };

    // Only a failure of the latest open request clears the pending row. An earlier open request no longer owns the
    // pending row.
    case 'openFailure':
      return action.openCount === tree.openCount ? updateTree(tree, { pendingId: null }) : tree;

    default:
      return tree;
  }
}

export default function treeViewReducer(tree = initialTreeState, action = {}) {
  const next = reduceTree(tree, action);
  return next === tree ? tree : deepFreeze(next);
}
