/* global test, expect */
import reducer, { STATUS, initialTreeState, isShown, storedAncestorIds } from '../TreeViewReducer';
import { loadActions } from './mockTree';

function makeNode(id, parentId, extra = {}) {
  return { id, parentId, treeTitle: `Page ${id}`, hasChildren: false, ...extra };
}

function reduce(actions, state) {
  return actions.reduce(reducer, state);
}

// Pages: 1 and 2 at the top level, 3 and 4 under 1, 5 under 3, 7 under 2
function makeLoadedState() {
  return reduce([
    ...loadActions(0, [makeNode(1, 0, { hasChildren: true }), makeNode(2, 0, { hasChildren: true })]),
    ...loadActions(1, [makeNode(3, 1, { hasChildren: true }), makeNode(4, 1)]),
    ...loadActions(3, [makeNode(5, 3)]),
    ...loadActions(2, [makeNode(7, 2)]),
    { type: 'expandNode', id: 1 },
    { type: 'expandNode', id: 3 },
    { type: 'expandNode', id: 2 },
  ]);
}

test('TreeViewReducer ignores a response for a parent that is no longer loading', () => {
  const loaded = makeLoadedState();
  expect(reducer(loaded, { type: 'fetchChildrenSuccess', parentId: 4, nodes: [makeNode(8, 4)] })).toBe(loaded);
  expect(reducer(loaded, { type: 'fetchChildrenFailure', parentId: 4 })).toBe(loaded);

  const received = reduce(loadActions(4, [makeNode(9, 4)]), loaded);
  expect(reducer(received, { type: 'fetchChildrenSuccess', parentId: 4, nodes: [makeNode(8, 4)] })).toBe(received);
  expect(reducer(received, { type: 'fetchChildrenFailure', parentId: 4 })).toBe(received);
  expect(received.childIds[4]).toEqual([9]);
  expect(received.nodes[8]).toBeUndefined();
});

test('TreeViewReducer stores received nodes under the parent they were requested for', () => {
  const tree = reduce(loadActions(0, [makeNode(1, null), makeNode(2, 5)]));
  expect(tree.nodes[1].parentId).toBe(0);
  expect(tree.nodes[2].parentId).toBe(0);
});

test('TreeViewReducer takes a received node out of the list of its old parent', () => {
  const tree = reduce(loadActions(2, [makeNode(7, 2), makeNode(4, 2)]), makeLoadedState());
  expect(tree.childIds[1]).toEqual([3]);
  expect(tree.childIds[2]).toEqual([7, 4]);
  expect(tree.nodes[4].parentId).toBe(2);
});

test('TreeViewReducer does not reopen a path collapsed since its reveal for a repeated success', () => {
  const state = reduce([
    { type: 'collapseNode', id: 2 },
    { type: 'revealRequest', id: 7 },
    { type: 'revealSuccess', id: 7, ids: [2] },
    { type: 'collapseNode', id: 2 },
  ], makeLoadedState());
  expect(state.expanded).not.toContain(2);

  expect(reducer(state, { type: 'revealSuccess', id: 7, ids: [2] })).toBe(state);
});

test('TreeViewReducer drops each list on a revealed path that misses the next id', () => {
  const state = reducer(makeLoadedState(), { type: 'revealRequest', id: 8 });
  const tree = reducer(state, { type: 'revealSuccess', id: 8, ids: [2] });
  expect(tree.childIds[2]).toBeUndefined();
  expect(tree.childIds[0]).toEqual([1, 2]);

  const topLevel = reducer(state, { type: 'revealSuccess', id: 8, ids: [] });
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
  expect(isShown(reducer(tree, { type: 'collapseNode', id: 1 }), 5)).toBe(false);

  const moved = reduce(loadActions(1, [makeNode(4, 1)]), tree);
  expect(storedAncestorIds(moved, 5)).toBeNull();
  expect(isShown(moved, 5)).toBe(false);

  const cycle = reduce([...loadActions(1, [makeNode(2, 1)]), ...loadActions(2, [makeNode(1, 2)])]);
  expect(storedAncestorIds(cycle, 1)).toBeNull();
});

test('TreeViewReducer keeps the top level and the lists on screen on a reload, and clears failures', () => {
  const state = reduce([
    { type: 'collapseNode', id: 2 },
    { type: 'fetchChildrenRequest', parentId: 4 },
    { type: 'fetchChildrenFailure', parentId: 4 },
    { type: 'expandNode', id: 4 },
    { type: 'fetchChildrenRequest', parentId: 7 },
    { type: 'fetchChildrenRequest', parentId: 3 },
  ], makeLoadedState());

  const reloaded = reducer(state, { type: 'reloadRequest', reloadKey: 1 });
  expect(Object.keys(reloaded.childIds)).toEqual(['0', '1', '3']);
  expect(reloaded.status).toEqual({ 3: STATUS.LOADING, 7: STATUS.LOADING });
  expect(reloaded.reloadKey).toBe(1);

  const underCollapsed = reduce([
    { type: 'collapseNode', id: 1 },
    { type: 'reloadRequest', reloadKey: 1 },
  ], makeLoadedState());
  expect(Object.keys(underCollapsed.childIds)).toEqual(['0', '2']);
});

test('TreeViewReducer returns frozen state and leaves the given nodes alone', () => {
  const node = makeNode(3, 1);
  const tree = reduce(loadActions(1, [node]));
  expect(node).toEqual(makeNode(3, 1));
  expect(Object.isFrozen(node)).toBe(false);
  expect(Object.isFrozen(tree)).toBe(true);
  expect(Object.isFrozen(tree.nodes[3])).toBe(true);
  expect(() => { tree.childIds[1].push(4); }).toThrow(TypeError);
});

test('TreeViewReducer returns the same state when an action changes nothing', () => {
  const setScroll = { type: 'setScroll', scrollTop: 120 };
  const state = reduce([
    setScroll,
    { type: 'revealRequest', id: 7 },
    { type: 'revealSuccess', id: 7, ids: [2] },
  ], makeLoadedState());
  [
    { type: 'expandNode', id: 1 },
    { type: 'expandNode', id: 0 },
    { type: 'collapseNode', id: 4 },
    setScroll,
    { type: 'revealSuccess', id: 7, ids: [2] },
    { type: 'revealSuccess', id: 8, ids: [2] },
    { type: 'fetchChildrenSuccess', parentId: 1, nodes: [makeNode(3, 1)] },
    { type: 'fetchChildrenFailure', parentId: 1 },
    { type: 'UNKNOWN_ACTION' },
  ].forEach((action) => {
    expect(reducer(state, action)).toBe(state);
  });

  const loading = reducer(state, { type: 'fetchChildrenRequest', parentId: 4 });
  expect(reducer(loading, { type: 'fetchChildrenRequest', parentId: 4 })).toBe(loading);
  expect(reducer(undefined, { type: 'UNKNOWN_ACTION' })).toBe(initialTreeState);
});
