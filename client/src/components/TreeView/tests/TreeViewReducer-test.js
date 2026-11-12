/* global test, expect */
import reducer, { STATUS, initialTreeState, isShown, storedAncestorIds } from '../TreeViewReducer';
import {
  collapseNode,
  expandNode,
  fetchChildrenFailure,
  fetchChildrenRequest,
  fetchChildrenSuccess,
  reloadRequest,
  revealRequest,
  revealSuccess,
  setScroll,
} from '../TreeViewActions';

function makeNode(id, parentId, extra = {}) {
  return { id, parentId, treeTitle: `Page ${id}`, hasChildren: false, ...extra };
}

function reduce(actions, state) {
  return actions.reduce(reducer, state);
}

function load(parentId, nodes) {
  return [fetchChildrenRequest(parentId), fetchChildrenSuccess(parentId, nodes)];
}

// Pages: 1 and 2 at the top level, 3 and 4 under 1, 5 under 3, 7 under 2
function makeLoadedState() {
  return reduce([
    ...load(0, [makeNode(1, 0, { hasChildren: true }), makeNode(2, 0, { hasChildren: true })]),
    ...load(1, [makeNode(3, 1, { hasChildren: true }), makeNode(4, 1)]),
    ...load(3, [makeNode(5, 3)]),
    ...load(2, [makeNode(7, 2)]),
    expandNode(1),
    expandNode(3),
    expandNode(2),
  ]);
}

test('TreeViewReducer starts a tree empty', () => {
  expect(reducer(undefined, setScroll(120))).toEqual({
    nodes: {},
    childIds: {},
    status: {},
    expanded: [],
    rootCollapsed: false,
    scrollTop: 120,
    revealedId: null,
    revealing: false,
    reloadKey: null,
  });
});

test('TreeViewReducer ignores a response for a parent that is no longer loading', () => {
  const loaded = makeLoadedState();
  expect(reducer(loaded, fetchChildrenSuccess(4, [makeNode(8, 4)]))).toBe(loaded);
  expect(reducer(loaded, fetchChildrenFailure(4))).toBe(loaded);

  const received = reduce([fetchChildrenRequest(4), fetchChildrenSuccess(4, [makeNode(9, 4)])], loaded);
  expect(reducer(received, fetchChildrenSuccess(4, [makeNode(8, 4)]))).toBe(received);
  expect(reducer(received, fetchChildrenFailure(4))).toBe(received);
  expect(received.childIds[4]).toEqual([9]);
  expect(received.nodes[8]).toBeUndefined();
});

test('TreeViewReducer stores received nodes under the parent they were requested for', () => {
  const tree = reduce(load(0, [makeNode(1, null), makeNode(2, 5)]));
  expect(tree.nodes[1].parentId).toBe(0);
  expect(tree.nodes[2].parentId).toBe(0);
});

test('TreeViewReducer takes a received node out of the list of its old parent', () => {
  const tree = reduce(load(2, [makeNode(7, 2), makeNode(4, 2)]), makeLoadedState());
  expect(tree.childIds[1]).toEqual([3]);
  expect(tree.childIds[2]).toEqual([7, 4]);
  expect(tree.nodes[4].parentId).toBe(2);
});

test('TreeViewReducer does not reopen a path collapsed since its reveal for a repeated success', () => {
  const state = reduce([
    collapseNode(2),
    revealRequest(7),
    revealSuccess(7, [2]),
    collapseNode(2),
  ], makeLoadedState());
  expect(state.expanded).not.toContain(2);

  expect(reducer(state, revealSuccess(7, [2]))).toBe(state);
});

test('TreeViewReducer drops each list on a revealed path that misses the next id', () => {
  const state = reducer(makeLoadedState(), revealRequest(8));
  const tree = reducer(state, revealSuccess(8, [2]));
  expect(tree.childIds[2]).toBeUndefined();
  expect(tree.childIds[0]).toEqual([1, 2]);

  const topLevel = reducer(state, revealSuccess(8, []));
  expect(topLevel.childIds[0]).toBeUndefined();
  expect(topLevel.childIds[2]).toEqual([7]);
});

test('storedAncestorIds walks a stored path to the top level, and isShown needs it intact and expanded', () => {
  const tree = makeLoadedState();
  expect(storedAncestorIds(tree, 5)).toEqual([1, 3]);
  expect(storedAncestorIds(tree, 1)).toEqual([]);
  expect(storedAncestorIds(tree, 9)).toBeNull();
  expect(isShown(tree, 5)).toBe(true);
  expect(isShown(tree, 5, false)).toBe(false);
  expect(isShown(reducer(tree, collapseNode(1)), 5)).toBe(false);

  const moved = reduce(load(1, [makeNode(4, 1)]), tree);
  expect(storedAncestorIds(moved, 5)).toBeNull();
  expect(isShown(moved, 5)).toBe(false);

  const cycle = reduce([...load(1, [makeNode(2, 1)]), ...load(2, [makeNode(1, 2)])]);
  expect(storedAncestorIds(cycle, 1)).toBeNull();
});

test('TreeViewReducer keeps the top level and the lists on screen on a reload, and clears failures', () => {
  const state = reduce([
    collapseNode(2),
    fetchChildrenRequest(4),
    fetchChildrenFailure(4),
    expandNode(4),
    fetchChildrenRequest(7),
    fetchChildrenRequest(3),
  ], makeLoadedState());

  const reloaded = reducer(state, reloadRequest(1));
  expect(Object.keys(reloaded.childIds)).toEqual(['0', '1', '3']);
  expect(reloaded.status).toEqual({ 3: STATUS.LOADING, 7: STATUS.LOADING });
  expect(reloaded.reloadKey).toBe(1);

  const underCollapsed = reduce([collapseNode(1), reloadRequest(1)], makeLoadedState());
  expect(Object.keys(underCollapsed.childIds)).toEqual(['0', '2']);
});

test('TreeViewReducer keeps the rows of a list that fails to load again, and marks no failure', () => {
  const failed = reduce([fetchChildrenRequest(1), fetchChildrenFailure(1)], makeLoadedState());
  expect(failed.childIds[1]).toEqual([3, 4]);
  expect(failed.status).toEqual({});
});

test('TreeViewReducer returns frozen state and leaves the given nodes alone', () => {
  const node = makeNode(3, 1);
  const tree = reduce(load(1, [node]));
  expect(node).toEqual(makeNode(3, 1));
  expect(Object.isFrozen(node)).toBe(false);
  expect(Object.isFrozen(tree)).toBe(true);
  expect(Object.isFrozen(tree.nodes[3])).toBe(true);
  expect(() => { tree.childIds[1].push(4); }).toThrow(TypeError);
});

test('TreeViewReducer returns the same state when an action changes nothing', () => {
  const state = reduce([setScroll(120), revealRequest(7), revealSuccess(7, [2])], makeLoadedState());
  [
    expandNode(1),
    expandNode(0),
    collapseNode(4),
    setScroll(120),
    revealSuccess(7, [2]),
    revealSuccess(8, [2]),
    fetchChildrenSuccess(1, [makeNode(3, 1)]),
    fetchChildrenFailure(1),
    { type: 'UNKNOWN_ACTION' },
    { type: 'UNKNOWN_ACTION', payload: null },
  ].forEach((action) => {
    expect(reducer(state, action)).toBe(state);
  });

  const loading = reducer(state, fetchChildrenRequest(4));
  expect(reducer(loading, fetchChildrenRequest(4))).toBe(loading);
  expect(reducer(undefined, { type: 'UNKNOWN_ACTION' })).toBe(initialTreeState);
});
