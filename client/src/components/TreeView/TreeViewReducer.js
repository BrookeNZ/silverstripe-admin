import deepFreeze from 'deep-freeze-strict';

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
      // A list that fails to load again keeps its rows
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

    case 'revealRequest':
      return updateTree(tree, { revealedId: action.id, revealing: action.id !== null });

    // `ids` are the ancestors of the node `id`, top level first
    case 'revealSuccess':
      return tree.revealing && tree.revealedId === action.id ? receivePath(tree, action.id, action.ids) : tree;

    case 'reloadRequest':
      return reload(tree, action.reloadKey);

    default:
      return tree;
  }
}

export default function treeViewReducer(tree = initialTreeState, action = {}) {
  const next = reduceTree(tree, action);
  return next === tree ? tree : deepFreeze(next);
}
