/* global jest, test, expect */
import reducer, { STATUS, initialTreeState } from '../TreeViewReducer';
import { loadChildren, reloadTree, revealNode } from '../TreeViewActions';
import { deferred, loadActions } from './mockTree';

function makeStore(actions = []) {
  let state = actions.reduce(reducer, initialTreeState);
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reducer(state, action);
    },
  };
}

// Pages: 1 and 2 at the top level, 5 and 6 under 2, 7 under 5
function loadedStore() {
  return makeStore([
    ...loadActions(0, [{ id: 1, parentId: 0 }, { id: 2, parentId: 0, hasChildren: true }]),
    ...loadActions(2, [{ id: 5, parentId: 2, hasChildren: true }, { id: 6, parentId: 2 }]),
    ...loadActions(5, [{ id: 7, parentId: 5 }]),
  ]);
}

test('loadChildren marks the parent failed when the fetch throws or the response is not a list of objects', async () => {
  const fetches = [
    () => { throw new Error('Bad URL'); },
    () => Promise.resolve({ error: 'Denied' }),
    () => Promise.resolve([{ id: 1, parentId: 0 }, null]),
  ];
  await Promise.all(fetches.map(async (fetchChildren) => {
    const store = makeStore();
    await expect(loadChildren(store, 0, fetchChildren)).resolves.toBeUndefined();
    expect(store.getState().status[0]).toBe(STATUS.FAILED);
    expect(store.getState().childIds[0]).toBeUndefined();
  }));
});

test('reloadTree fetches each list on screen once, and leaves a list already loading to its own request', async () => {
  const store = loadedStore();
  store.dispatch({ type: 'expandNode', id: 2 });
  const pending = deferred();
  const fetchChildren = jest.fn((parentId) => (
    parentId === 2 ? pending.promise : Promise.resolve([{ id: 9, parentId }])
  ));
  loadChildren(store, 2, fetchChildren);

  const reloaded = reloadTree(store, 1, fetchChildren);
  expect(fetchChildren.mock.calls).toEqual([[2], [0]]);
  expect(store.getState().childIds[5]).toBeUndefined();

  pending.resolve([{ id: 8, parentId: 2 }]);
  await reloaded;
  expect(store.getState().childIds).toEqual({ 0: [9], 2: [8] });
});

test('revealNode changes nothing on a failed fetch or a malformed path', async () => {
  const fetches = [
    () => Promise.reject(new Error('Server error')),
    () => { throw new Error('Bad URL'); },
    () => Promise.resolve({ error: 'Denied' }),
  ];
  await Promise.all(fetches.map(async (fetchPath) => {
    const store = loadedStore();
    const done = revealNode(store, 9, fetchPath);
    const requested = store.getState();
    await expect(done).resolves.toBeUndefined();
    expect(store.getState()).toBe(requested);
  }));
});
