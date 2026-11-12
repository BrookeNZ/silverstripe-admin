/* global jest, test, expect */
import reducer, { STATUS, initialTreeState } from '../TreeViewReducer';
import {
  expandNode,
  fetchChildrenRequest,
  fetchChildrenSuccess,
  loadChildren,
  reloadTree,
  revealNode,
} from '../TreeViewActions';

function makeStore(actions = []) {
  let state = actions.reduce(reducer, initialTreeState);
  const dispatched = [];
  const getState = () => state;
  const dispatch = (action) => {
    dispatched.push(action);
    state = reducer(state, action);
  };
  const run = (asyncAction, ...args) => asyncAction(dispatch, getState, ...args);
  return { dispatch, getState, dispatched, run };
}

function deferred() {
  const result = {};
  result.promise = new Promise((resolve) => {
    result.resolve = resolve;
  });
  return result;
}

const children = [{ id: 1, parentId: 0 }, { id: 2, parentId: 0 }];

// Pages: 1 and 2 at the top level, 5 and 6 under 2, 7 under 5
function loadedStore() {
  const lists = {
    0: [{ id: 1, parentId: 0 }, { id: 2, parentId: 0, hasChildren: true }],
    2: [{ id: 5, parentId: 2, hasChildren: true }, { id: 6, parentId: 2 }],
    5: [{ id: 7, parentId: 5 }],
  };
  return makeStore(Object.entries(lists).flatMap(([parentId, nodes]) => [
    fetchChildrenRequest(Number(parentId)),
    fetchChildrenSuccess(Number(parentId), nodes),
  ]));
}

test('loadChildren makes one request at a time, and none for a loaded parent', async () => {
  const store = makeStore();
  const response = deferred();
  const fetchChildren = jest.fn(() => response.promise);

  const first = store.run(loadChildren, 0, fetchChildren);
  await store.run(loadChildren, 0, fetchChildren);
  await store.run(loadChildren, 0, fetchChildren, { force: true });
  response.resolve(children);
  await first;
  await store.run(loadChildren, 0, fetchChildren);

  expect(fetchChildren).toHaveBeenCalledTimes(1);
  expect(store.dispatched).toHaveLength(2);
});

test('loadChildren marks the parent failed when the fetch throws or the response is not a list of objects', async () => {
  const fetches = [
    () => { throw new Error('Bad URL'); },
    () => Promise.resolve({ error: 'Denied' }),
    () => Promise.resolve([{ id: 1, parentId: 0 }, null]),
  ];
  await Promise.all(fetches.map(async (fetchChildren) => {
    const store = makeStore();
    await expect(store.run(loadChildren, 0, fetchChildren)).resolves.toBeUndefined();
    expect(store.getState().status[0]).toBe(STATUS.FAILED);
    expect(store.getState().childIds[0]).toBeUndefined();
  }));
});

test('reloadTree fetches each list on screen once, and leaves a list already loading to its own request', async () => {
  const store = loadedStore();
  store.dispatch(expandNode(2));
  const pending = deferred();
  const fetchChildren = jest.fn((parentId) => (
    parentId === 2 ? pending.promise : Promise.resolve([{ id: 9, parentId }])
  ));
  store.run(loadChildren, 2, fetchChildren, { force: true });

  const reloaded = store.run(reloadTree, 1, fetchChildren);
  expect(fetchChildren.mock.calls).toEqual([[2], [0]]);
  expect(store.getState().childIds[5]).toBeUndefined();

  pending.resolve([{ id: 8, parentId: 2 }]);
  await reloaded;
  expect(store.getState().childIds).toEqual({ 0: [9], 2: [8] });
});

test('reloadTree records the value and fetches nothing for a tree with no list loaded', async () => {
  const store = makeStore();
  const fetchChildren = jest.fn(() => Promise.resolve([]));

  await store.run(reloadTree, 'saved', fetchChildren);

  expect(fetchChildren).not.toHaveBeenCalled();
  expect(store.getState().reloadKey).toBe('saved');
});

test('revealNode changes nothing on a failed fetch or a malformed path', async () => {
  const fetches = [
    () => Promise.reject(new Error('Server error')),
    () => { throw new Error('Bad URL'); },
    () => Promise.resolve({ error: 'Denied' }),
  ];
  await Promise.all(fetches.map(async (fetchPath) => {
    const store = loadedStore();
    const done = store.run(revealNode, 9, fetchPath);
    const requested = store.getState();
    await expect(done).resolves.toBeUndefined();
    expect(store.getState()).toBe(requested);
  }));
});
