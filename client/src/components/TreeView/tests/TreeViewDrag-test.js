/* global jest, test, expect, beforeEach, afterEach */
import React, { useLayoutEffect } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { flushSync } from 'react-dom';
import i18n from 'i18n';
import ACTION_TYPES from '../TreeViewActionTypes';
import { clearTreeStores, getTreeStore } from '../treeViewStore';
import TreeView from '../TreeView';
import { deferred, getChildren, loadActions, makePage } from './mockTree';
import {
  dragTo,
  mockRowRects,
  moveOutside,
  moveTo,
  moveTouchBy,
  moveTouchTo,
  moveToPoint,
  pressEscape,
  pressTouch,
  release,
  releaseTouch,
  startDrag,
  tap,
} from './mockDrag';

const TREE_ID = 'pages';

let rectSpy;

beforeEach(() => {
  clearTreeStores();
  rectSpy = mockRowRects();
  // jsdom has no `scrollIntoView()`.
  Element.prototype.scrollIntoView = jest.fn();
});

function flush() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

// `@dnd-kit/core` stops the click after a drag for 50 ms. Wait past it, so the next test does not lose its first click.
const CLICK_GUARD_WAIT = 60;

afterEach(async () => {
  rectSpy.mockRestore();
  // A switch to real timers drops the pending fake timeouts, and the click stop of `@dnd-kit/core` would then stay on.
  if (jest.isMockFunction(setTimeout) || 'clock' in setTimeout) {
    act(() => jest.runOnlyPendingTimers());
  }
  jest.useRealTimers();
  await act(() => new Promise((resolve) => setTimeout(resolve, CLICK_GUARD_WAIT)));
});

// Store the top level and the children of each parent in `loadedIds`, and expand each parent in `expandedIds`.
function saveTree({ loadedIds = [], expandedIds = [] } = {}) {
  const store = getTreeStore(TREE_ID);
  [0, ...loadedIds, ...expandedIds]
    .flatMap((parentId) => loadActions(parentId, getChildren(parentId)))
    .concat(expandedIds.map((id) => ({ type: ACTION_TYPES.EXPAND_ITEM, id })))
    .forEach(store.dispatch);
}

function renderTree(overrides = {}) {
  const props = {
    treeId: TREE_ID,
    label: 'Site pages',
    titleRowText: 'My site',
    fetchChildren: jest.fn((parentId) => Promise.resolve(getChildren(parentId))),
    onMove: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<TreeView {...props} />);
  return props;
}

// Get the link of an item by its title. The name of a link also holds the text of its status badges.
function getRow(title) {
  return screen.getByRole('treeitem', { name: new RegExp(`^${title}\\b`) });
}

// Get the text of the live region of the tree, which announces a move. The live region of dnd-kit has no class.
function getAnnouncement() {
  return document.querySelector('.tree-view > .visually-hidden[aria-live="assertive"]').textContent;
}

test('A drag of an item to the bottom third of its next sibling moves the item after the sibling', () => {
  saveTree();
  const { onMove } = renderTree();

  dragTo(getRow('Home'), getRow('About us'), 0.9);

  expect(onMove).toHaveBeenCalledTimes(1);
  expect(onMove).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1, treeTitle: 'Home' }),
    { parentId: 0, position: 'after', targetId: 2, siblingIds: [2, 1, 3, 4] },
  );
});

test('A drag of an item to the middle of a sibling moves the item last inside the sibling and expands it', () => {
  saveTree({ loadedIds: [2] });
  const { onMove } = renderTree();
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');

  dragTo(getRow('Contact us'), getRow('About us'));

  expect(onMove).toHaveBeenCalledWith(
    expect.objectContaining({ id: 4 }),
    { parentId: 2, position: 'inside', targetId: 2, siblingIds: [5, 6, 4] },
  );
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
});

test('A drop inside an item whose children are not loaded sends no sibling ids', async () => {
  saveTree();
  const { onMove, fetchChildren } = renderTree();

  dragTo(getRow('Contact us'), getRow('Home'));
  await flush();

  expect(onMove).toHaveBeenCalledWith(
    expect.objectContaining({ id: 4 }),
    { parentId: 1, position: 'inside', targetId: 1, siblingIds: null },
  );
  expect(fetchChildren).toHaveBeenCalledWith(1);
});

test('A drop that leaves the item where it is falls back to the next position', () => {
  saveTree({ loadedIds: [2] });
  const { onMove } = renderTree();

  // Before About us is the place Home already has, so the drop goes inside About us.
  dragTo(getRow('Home'), getRow('About us'), 0.1);

  expect(onMove).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
    { parentId: 2, position: 'inside', targetId: 2, siblingIds: [5, 6, 1] },
  );
});

test('A drop on the item itself or in its own branch calls no move', () => {
  saveTree({ expandedIds: [2] });
  const { onMove } = renderTree();

  dragTo(getRow('About us'), getRow('About us'));
  dragTo(getRow('About us'), getRow('Our team'), 0.1);
  dragTo(getRow('About us'), getRow('History'), 0.9);

  expect(onMove).not.toHaveBeenCalled();
});

test('A drop that `canDrop` refuses calls no move', () => {
  saveTree();
  const canDrop = jest.fn(() => false);
  const { onMove } = renderTree({ canDrop });

  dragTo(getRow('Home'), getRow('About us'), 0.9);

  expect(canDrop).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
    { parentId: 0, position: 'after', targetItem: expect.objectContaining({ id: 2 }) },
  );
  expect(onMove).not.toHaveBeenCalled();
});

test('Escape during a drag and a release outside the tree call no move', () => {
  saveTree();
  const { onMove } = renderTree();

  startDrag(getRow('Home'));
  moveTo(getRow('About us'), 0.9);
  pressEscape();
  release();

  startDrag(getRow('Home'));
  moveOutside();
  release();

  expect(onMove).not.toHaveBeenCalled();
});

test('No drag starts while a move is pending', async () => {
  saveTree();
  const request = deferred();
  const onMove = jest.fn(() => request.promise);
  renderTree({ onMove });

  dragTo(getRow('Home'), getRow('About us'), 0.9);
  dragTo(getRow('Contact us'), getRow('Home'), 0.1);
  expect(onMove).toHaveBeenCalledTimes(1);

  request.resolve();
  await flush();
  dragTo(getRow('Contact us'), getRow('Home'), 0.1);
  expect(onMove).toHaveBeenCalledTimes(2);
});

test('The click that ends a drag does not open the item', () => {
  saveTree();
  const onOpen = jest.fn();
  renderTree({ onOpen });
  const link = getRow('Home');

  dragTo(link, getRow('About us'), 0.9);
  const isClickAllowed = fireEvent.click(link);

  expect(onOpen).not.toHaveBeenCalled();
  expect(isClickAllowed).toBe(false);
});

test('The release after Escape does not open the item', async () => {
  saveTree();
  const onOpen = jest.fn();
  const { onMove } = renderTree({ onOpen });
  const link = getRow('Home');

  startDrag(link);
  pressEscape();
  // `MouseSensor` stops the propagation of clicks for a short time after a cancel. The member releases later.
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  moveTo(link);
  release();
  fireEvent.click(link);

  expect(onOpen).not.toHaveBeenCalled();
  expect(onMove).not.toHaveBeenCalled();
});

test('A drop inside the parent of the last item calls no move', () => {
  saveTree({ expandedIds: [2] });
  const { onMove } = renderTree();

  dragTo(getRow('History'), getRow('About us'));

  expect(onMove).not.toHaveBeenCalled();
});

test('A drop inside the parent of an item that is not last moves the item last', () => {
  saveTree({ expandedIds: [2] });
  const { onMove } = renderTree();

  dragTo(getRow('Our team'), getRow('About us'));

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 5 }),
    { parentId: 2, position: 'inside', targetId: 2, siblingIds: [6, 5] },
  ]]);
});

test('A drop inside the parent of an item that `canDrop` refuses tries no other position', () => {
  saveTree({ expandedIds: [2] });
  const canDrop = jest.fn((item, { position }) => position !== 'inside');
  const { onMove } = renderTree({ canDrop });

  dragTo(getRow('Our team'), getRow('About us'));

  expect(canDrop).toHaveBeenCalledTimes(1);
  expect(onMove).not.toHaveBeenCalled();
});

test('A refused drop in the middle third falls back to the nearer half', async () => {
  saveTree();
  const canDrop = (item, { position }) => position !== 'inside';
  const { onMove } = renderTree({ canDrop });

  dragTo(getRow('Contact us'), getRow('Home'), 0.4);
  await flush();
  dragTo(getRow('Contact us'), getRow('Home'), 0.6);

  expect(onMove.mock.calls.map(([, move]) => move.position)).toEqual(['before', 'after']);
});

test('A refused drop in the bottom third falls back to inside', async () => {
  saveTree();
  const { onMove } = renderTree({ canDrop: (item, { position }) => position !== 'after' });

  dragTo(getRow('Contact us'), getRow('Home'), 0.9);
  await flush();

  expect(onMove.mock.calls[0][1].position).toBe('inside');
});

test('A drop inside an item with too many children sends no sibling ids', () => {
  saveTree({ loadedIds: [3] });
  const { onMove } = renderTree();

  dragTo(getRow('Home'), getRow('News'));

  expect(onMove.mock.calls[0][1]).toEqual({ parentId: 3, position: 'inside', targetId: 3, siblingIds: null });
});

test('A drag starts only on the main button with no Ctrl key', () => {
  saveTree();
  const { onMove } = renderTree();

  startDrag(getRow('Home'), { button: 1 });
  moveTo(getRow('About us'), 0.9);
  release();
  startDrag(getRow('Home'), { ctrlKey: true });
  moveTo(getRow('About us'), 0.9);
  release();

  expect(onMove).not.toHaveBeenCalled();
});

test('An arrow key during a drag does not move focus', () => {
  saveTree();
  renderTree();
  const link = getRow('Home');
  act(() => link.focus());

  startDrag(link);
  fireEvent.keyDown(link, { key: 'ArrowDown' });

  expect(document.activeElement).toBe(link);
  pressEscape();
  release();
});

test('A drag start closes the context menu', () => {
  saveTree();
  renderTree({ getMenuItems: () => [{ id: 'edit', label: 'Edit', onSelect: jest.fn() }] });

  fireEvent.contextMenu(getRow('Home'));
  expect(screen.getByRole('menu')).toBeTruthy();
  startDrag(getRow('About us'));

  expect(screen.queryByRole('menu')).toBeNull();
  pressEscape();
  release();
});

test('A move that rejects or throws lets the next drag start', async () => {
  saveTree();
  const onMove = jest.fn()
    .mockImplementationOnce(() => {
      throw new Error('Failed');
    })
    .mockImplementation(() => Promise.reject(new Error('Failed')));
  const { fetchChildren } = renderTree({ onMove });

  dragTo(getRow('Contact us'), getRow('Home'));
  await flush();
  expect(fetchChildren).toHaveBeenCalledWith(1);
  dragTo(getRow('Contact us'), getRow('Home'), 0.1);
  await flush();
  dragTo(getRow('Contact us'), getRow('Home'), 0.9);

  expect(onMove).toHaveBeenCalledTimes(3);
});

test.each([
  ['cancelled', () => Promise.resolve(false)],
  ['failed', () => Promise.reject(new Error('Refused'))],
])('A %s drop inside a collapsed item collapses it again', async (_, onMove) => {
  saveTree();
  renderTree({ onMove: jest.fn(onMove) });

  dragTo(getRow('Home'), getRow('About us'));
  await flush();

  expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
});

test.each([
  ['cancelled', () => Promise.resolve(false)],
  ['failed', () => Promise.reject(new Error('Refused'))],
])('A %s drop inside an expanded item leaves it expanded', async (_, onMove) => {
  saveTree({ expandedIds: [2] });
  renderTree({ onMove: jest.fn(onMove) });

  dragTo(getRow('Home'), getRow('About us'));
  await flush();

  expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
});

test('The overlay shows the title of the item during a drag', () => {
  saveTree();
  renderTree();

  startDrag(getRow('Home'));
  moveTo(getRow('About us'), 0.9);
  expect(document.querySelector('.tree-view__drag-overlay').textContent).toBe('Home');
  pressEscape();
  release();

  expect(document.querySelector('.tree-view__drag-overlay')).toBeNull();
});

test('The marker shows the position of the move at the pointer', () => {
  saveTree();
  renderTree();
  const getMarkerClass = () => document.querySelector('.tree-view__drop-marker').className;

  startDrag(getRow('Contact us'));
  moveTo(getRow('Home'), 0.1);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--before');
  moveTo(getRow('Home'));
  expect(getMarkerClass()).toContain('tree-view__drop-marker--inside');
  moveTo(getRow('Home'), 0.9);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--after');
  moveTo(getRow('Contact us'));
  expect(document.querySelector('.tree-view__drop-marker')).toBeNull();
  pressEscape();
  release();
});

test('A press on a link is default-prevented so that focus stays, and a press and release with no drag opens the item', () => {
  saveTree();
  const onOpen = jest.fn();
  renderTree({ onOpen });
  const link = getRow('Home');

  const isFocusAllowed = fireEvent.mouseDown(link, { button: 0 });
  fireEvent.mouseUp(link, { button: 0 });
  fireEvent.click(link, { button: 0 });

  expect(isFocusAllowed).toBe(false);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('A press with another button or with Ctrl is not default-prevented', () => {
  saveTree();
  renderTree();

  expect(fireEvent.mouseDown(getRow('Home'), { button: 1 })).toBe(true);
  expect(fireEvent.mouseDown(getRow('Home'), { button: 0, ctrlKey: true })).toBe(true);
});

test('A press on a link of a tree without `onMove` is not default-prevented', () => {
  saveTree();
  renderTree({ onMove: undefined });

  expect(fireEvent.mouseDown(getRow('Home'), { button: 0 })).toBe(true);
});

test('A drag ends when `onMove` goes away, so the arrow keys move focus again', () => {
  saveTree();
  const props = {
    treeId: TREE_ID,
    label: 'Site pages',
    titleRowText: 'My site',
    fetchChildren: jest.fn((parentId) => Promise.resolve(getChildren(parentId))),
  };
  const { rerender } = render(<TreeView {...props} onMove={jest.fn(() => Promise.resolve())} />);
  startDrag(getRow('Home'));

  // The list mounts again without `DndContext`, so the test focuses the new link.
  rerender(<TreeView {...props} />);
  const link = getRow('Home');
  act(() => link.focus());
  fireEvent.keyDown(link, { key: 'ArrowDown' });

  expect(document.activeElement).toBe(getRow('About us'));
  release();
});

test('The target is the whole row of an item, across the tree and without the group of its children', () => {
  saveTree({ expandedIds: [2] });
  renderTree();
  const getMarkerClass = () => document.querySelector('.tree-view__drop-marker').className;

  startDrag(getRow('Contact us'));
  // About us is the second row, from 30 to 60. Its link spans 20 to 120 across, so 250 is outside the link.
  moveToPoint(250, 45);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--inside');
  moveToPoint(250, 31);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--before');
  moveToPoint(250, 58);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--after');
  // The bottom edge of About us is the top edge of Our team.
  moveToPoint(250, 60);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--before');
  pressEscape();
  release();
});

test('A release after `onMove` goes away during a drag calls no move', () => {
  saveTree();
  const props = {
    treeId: TREE_ID,
    label: 'Site pages',
    titleRowText: 'My site',
    fetchChildren: jest.fn((parentId) => Promise.resolve(getChildren(parentId))),
  };
  const onMove = jest.fn(() => Promise.resolve());
  const { rerender } = render(<TreeView {...props} onMove={onMove} />);

  startDrag(getRow('Home'));
  moveTo(getRow('About us'), 0.9);
  rerender(<TreeView {...props} />);
  release();

  expect(onMove).not.toHaveBeenCalled();
});

test('A pointer on the edge between two rows targets the lower row', () => {
  saveTree();
  renderTree();

  startDrag(getRow('Home'));
  // Home spans 0 to 30. A pointer at 30 that targeted Home itself would give no move.
  moveToPoint(250, 30);

  expect(document.querySelector('.tree-view__drop-marker')).not.toBeNull();
  pressEscape();
  release();
});

test('A pointer that stays on the row of a collapsed parent for 500 ms expands it and loads its children once', async () => {
  jest.useFakeTimers();
  saveTree();
  const { fetchChildren } = renderTree();

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'), 0.1);
  act(() => jest.advanceTimersByTime(400));
  // A move to another third of the same row keeps the timer.
  moveTo(getRow('About us'), 0.9);
  act(() => jest.advanceTimersByTime(99));
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
  act(() => jest.advanceTimersByTime(1));
  await act(async () => {});

  expect(fetchChildren.mock.calls).toEqual([[2]]);
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
  pressEscape();
  release();
});

test('A pointer that moves to another row before 500 ms expands nothing', () => {
  jest.useFakeTimers();
  saveTree();
  const { fetchChildren } = renderTree();

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'));
  act(() => jest.advanceTimersByTime(400));
  moveTo(getRow('Home'));
  act(() => jest.advanceTimersByTime(400));
  moveTo(getRow('About us'));
  act(() => jest.advanceTimersByTime(400));
  moveOutside();
  act(() => jest.advanceTimersByTime(1000));
  pressEscape();
  release();

  expect(fetchChildren).not.toHaveBeenCalled();
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
});

test('A cancel before 500 ms on the row of a collapsed parent expands nothing', () => {
  jest.useFakeTimers();
  saveTree();
  const { fetchChildren } = renderTree();

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'));
  act(() => jest.advanceTimersByTime(300));
  pressEscape();
  act(() => jest.advanceTimersByTime(1000));
  release();

  expect(fetchChildren).not.toHaveBeenCalled();
  expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
});

test('A drag does not expand the dragged item', () => {
  jest.useFakeTimers();
  saveTree();
  const { fetchChildren } = renderTree();

  startDrag(getRow('About us'));
  moveTo(getRow('About us'), 0.2);
  act(() => jest.advanceTimersByTime(1000));

  expect(fetchChildren).not.toHaveBeenCalled();
  pressEscape();
  release();
});

test('A drag finds the rows that a parent shows after a drag expands it', async () => {
  jest.useFakeTimers();
  saveTree();
  const { onMove } = renderTree();

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'));
  act(() => jest.advanceTimersByTime(500));
  await act(async () => {});
  moveTo(getRow('History'), 0.1);
  release();

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 4 }),
    { parentId: 2, position: 'before', targetId: 6, siblingIds: [5, 4, 6] },
  ]]);
});

test('A drag finds the rows that the loading row of an expanded parent moves down', async () => {
  jest.useFakeTimers();
  saveTree();
  const request = deferred();
  const { onMove } = renderTree({ fetchChildren: jest.fn(() => request.promise) });

  startDrag(getRow('Home'));
  moveTo(getRow('About us'));
  act(() => jest.advanceTimersByTime(500));
  expect(screen.getByText('Loading...')).toBeTruthy();
  moveTo(getRow('Contact us'), 0.1);
  release();

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 1 }),
    { parentId: 0, position: 'before', targetId: 4, siblingIds: [2, 3, 1, 4] },
  ]]);
});

test('A drop sends the order of the children of the new parent at the time of the drop', () => {
  saveTree();
  const { onMove } = renderTree();

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'), 0.9);
  // A reload during the drag adds a page to the top level.
  act(() => loadActions(0, [...getChildren(0), makePage(11, 0, 'New page')]).forEach(getTreeStore(TREE_ID).dispatch));
  release();

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 4 }),
    { parentId: 0, position: 'after', targetId: 2, siblingIds: [1, 2, 4, 3, 11] },
  ]]);
});

test('A drop after a reload that changes the move under the pointer sends the move of the marker', async () => {
  saveTree();
  const { onMove } = renderTree();
  const getMarkerClass = () => document.querySelector('.tree-view__drop-marker').className;

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'), 0.1);
  expect(getMarkerClass()).toContain('tree-view__drop-marker--before');
  // A reload during the drag puts Contact us before About us already, so the marker falls back to inside.
  const [home, aboutUs, news, contactUs] = getChildren(0);
  act(() => loadActions(0, [contactUs, aboutUs, home, news]).forEach(getTreeStore(TREE_ID).dispatch));
  expect(getMarkerClass()).toContain('tree-view__drop-marker--inside');
  release();
  // The drop expands About us, which loads its children.
  await flush();

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 4 }),
    { parentId: 2, position: 'inside', targetId: 2, siblingIds: null },
  ]]);
});

test('A drop that `canDrop` refuses at the time of the drop calls no move', () => {
  saveTree();
  let isInsideAllowed = true;
  const canDrop = (item, { position }) => isInsideAllowed || position !== 'inside';
  const { onMove } = renderTree({ canDrop });

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'));
  expect(document.querySelector('.tree-view__drop-marker').className).toContain('tree-view__drop-marker--inside');
  isInsideAllowed = false;
  release();

  expect(onMove).not.toHaveBeenCalled();
  expect(getAnnouncement()).toBe('Cannot drop Contact us here');
});

test('A drag finds the row under a still pointer after the rows move', () => {
  saveTree({ loadedIds: [2] });
  const { onMove } = renderTree();

  startDrag(getRow('Home'));
  moveTo(getRow('News'), 0.1);
  // The children of About us show above News, so Our team is now under the pointer.
  act(() => getTreeStore(TREE_ID).dispatch({ type: ACTION_TYPES.EXPAND_ITEM, id: 2 }));
  release();

  expect(onMove.mock.calls).toEqual([[
    expect.objectContaining({ id: 1 }),
    { parentId: 2, position: 'before', targetId: 5, siblingIds: [1, 5, 6] },
  ]]);
});

test('The marker follows its target row when the rows are measured again in another place', () => {
  saveTree();
  renderTree();
  const getMarkerTop = () => document.querySelector('.tree-view__drop-marker').style.top;

  startDrag(getRow('Contact us'));
  moveTo(getRow('About us'));
  expect(getMarkerTop()).toBe('30px');
  // The rows move 3px down inside the tree. The pointer stays over the middle of About us.
  const getRect = rectSpy.getMockImplementation();
  rectSpy.mockImplementation(function getShiftedRect() {
    const rect = getRect.call(this);
    return this.matches('.tree-view') ? rect : { ...rect, top: rect.top + 3, bottom: rect.bottom + 3, y: rect.y + 3 };
  });
  // Children that the tree does not show yet change the store, so the rows are measured again.
  act(() => loadActions(5, getChildren(5)).forEach(getTreeStore(TREE_ID).dispatch));

  expect(getMarkerTop()).toBe('33px');
  pressEscape();
  release();
});

// Render a tree that `reload()` reloads with a new `reloadKey`, as a host does after a move. Each request for children
// waits until the test calls `respond(parentId, children)`.
function renderReloadingTree(overrides = {}) {
  const requests = {};
  const props = {
    treeId: TREE_ID,
    label: 'Site pages',
    titleRowText: 'My site',
    fetchChildren: jest.fn((parentId) => {
      requests[parentId] = deferred();
      return requests[parentId].promise;
    }),
    onMove: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  const { rerender } = render(<TreeView {...props} />);
  return {
    ...props,
    reload: (reloadKey = 1) => rerender(<TreeView {...props} reloadKey={reloadKey} />),
    respond: async (parentId, children) => {
      requests[parentId].resolve(children);
      await flush();
    },
  };
}

// The server after History moves from under About us to after Home.
function getChildrenAfterHistoryMove(parentId) {
  const [home, aboutUs, news, contactUs] = getChildren(0);
  const [ourTeam, history] = getChildren(2);
  return parentId === 0 ? [home, { ...history, parentId: 0 }, aboutUs, news, contactUs] : [ourTeam];
}

function focusLink(link) {
  act(() => link.focus());
}

function getTabStop() {
  return document.querySelector('[role="treeitem"][tabindex="0"]');
}

describe('Focus after a move', () => {
  test.each([
    ['the old parent', 2, 0],
    ['the new parent', 0, 2],
  ])('The moved item takes focus in its new place when the children of %s arrive first', async (_, firstId, secondId) => {
    saveTree({ expandedIds: [2] });
    const { onMove, reload, respond } = renderReloadingTree();
    focusLink(getRow('History'));

    dragTo(getRow('History'), getRow('Home'), 0.9);
    expect(onMove).toHaveBeenCalledTimes(1);
    await flush();
    reload();
    await respond(firstId, getChildrenAfterHistoryMove(firstId));
    await respond(secondId, getChildrenAfterHistoryMove(secondId));

    const history = getRow('History');
    expect(history.getAttribute('aria-level')).toBe('1');
    expect(getTabStop()).toBe(history);
    expect(document.activeElement).toBe(history);
  });

  test('The moved item takes the Tab stop but not focus when focus is outside the tree', async () => {
    saveTree({ expandedIds: [2] });
    const { reload, respond } = renderReloadingTree();
    // The member last focused History, then clicked outside the tree.
    focusLink(getRow('History'));
    act(() => document.activeElement.blur());

    dragTo(getRow('History'), getRow('Home'), 0.9);
    await flush();
    reload();
    await respond(2, getChildrenAfterHistoryMove(2));
    await respond(0, getChildrenAfterHistoryMove(0));

    expect(getTabStop()).toBe(getRow('History'));
    expect(document.activeElement).toBe(document.body);
  });

  test('The moved item takes focus when the host starts the reload inside `onMove`', async () => {
    saveTree({ expandedIds: [2] });
    let host;
    // The CMS renders the new `reloadKey` with `flushSync`, so a reload that starts before the first `await` of
    // `onMove` starts before `onMove` returns.
    const onMove = jest.fn(() => {
      flushSync(() => host.reload());
      return Promise.resolve();
    });
    host = renderReloadingTree({ onMove });
    focusLink(getRow('History'));

    dragTo(getRow('History'), getRow('Home'), 0.9);
    await flush();
    await host.respond(2, getChildrenAfterHistoryMove(2));
    await host.respond(0, getChildrenAfterHistoryMove(0));

    expect(getTabStop()).toBe(getRow('History'));
    expect(document.activeElement).toBe(getRow('History'));
  });

  test.each([
    ['a collapsed parent whose children are not loaded', 'Our team', 5, () => [...getChildren(5)]],
    ['an item with no children', 'Home', 1, () => []],
  ])('A drop inside %s gives the moved item focus once the children of the target arrive', async (_, targetTitle, targetId, getTargetChildren) => {
    saveTree({ expandedIds: [2] });
    const request = deferred();
    const { reload, respond } = renderReloadingTree({ onMove: jest.fn(() => request.promise) });
    focusLink(getRow('Home'));

    dragTo(getRow('History'), getRow(targetTitle), 0.5);
    await flush();
    // The host starts the reload before the promise of `onMove` settles, as the CMS does.
    reload();
    request.resolve();
    await flush();
    const [ourTeam, history] = getChildren(2);
    await respond(0, getChildren(0).map((page) => (page.id === targetId ? { ...page, hasChildren: true } : page)));
    await respond(2, [ourTeam]);
    // The reload ignores the request that the drop started, and fetches again once it settles.
    await respond(targetId, getTargetChildren());
    await respond(targetId, [...getTargetChildren(), { ...history, parentId: targetId }]);

    expect(getTabStop()).toBe(getRow('History'));
    expect(document.activeElement).toBe(getRow('History'));
  });

  test('An item whose move fails takes focus in its old place after the reload', async () => {
    saveTree({ expandedIds: [2] });
    const request = deferred();
    const { reload, respond } = renderReloadingTree({ onMove: jest.fn(() => request.promise) });
    focusLink(getRow('Home'));

    dragTo(getRow('History'), getRow('Home'), 0.9);
    // The host starts the reload before the promise of `onMove` settles, as the CMS does.
    reload();
    request.resolve(Promise.reject(new Error('Refused')));
    await flush();
    await respond(2, getChildren(2));
    await respond(0, getChildren(0));

    const history = getRow('History');
    expect(history.getAttribute('aria-level')).toBe('2');
    expect(document.activeElement).toBe(history);
  });
});

describe('A move and an unrelated reload', () => {
  test('A reload that completes before the move settles keeps the move pending, and the next reload gives the moved item the Tab stop', async () => {
    saveTree({ expandedIds: [2] });
    const request = deferred();
    const { onMove, reload, respond } = renderReloadingTree({ onMove: jest.fn(() => request.promise) });

    dragTo(getRow('History'), getRow('Home'), 0.9);
    reload(1);
    await respond(2, getChildren(2));
    await respond(0, getChildren(0));
    await act(() => new Promise((resolve) => setTimeout(resolve, CLICK_GUARD_WAIT)));
    dragTo(getRow('Contact us'), getRow('Home'), 0.1);
    expect(onMove).toHaveBeenCalledTimes(1);

    request.resolve();
    await flush();
    reload(2);
    await respond(2, getChildrenAfterHistoryMove(2));
    await respond(0, getChildrenAfterHistoryMove(0));

    expect(getTabStop()).toBe(getRow('History'));
    expect(getRow('History').getAttribute('aria-level')).toBe('1');
  });

  test('A move that resolves to false gives the item no Tab stop on a later reload', async () => {
    saveTree({ expandedIds: [2] });
    const { reload, respond } = renderReloadingTree({ onMove: jest.fn(() => Promise.resolve(false)) });
    focusLink(getRow('Home'));

    dragTo(getRow('History'), getRow('Home'), 0.9);
    await flush();
    reload();
    await respond(2, getChildren(2));
    await respond(0, getChildren(0));

    expect(getTabStop()).toBe(getRow('Home'));
    expect(document.activeElement).toBe(getRow('Home'));
  });
});

describe('Announcements', () => {
  test('A drag announces the pick-up, each new position by title, a refused position and the drop', () => {
    saveTree();
    renderTree({ canDrop: (item, { targetItem }) => targetItem.id !== 4 });
    const home = getRow('Home');
    expect(document.getElementById(home.getAttribute('aria-describedby')).textContent).toBe(
      'To move an item, drag it with the mouse, or choose Move in its context menu, and drop it before, inside or after another item.',
    );

    startDrag(home);
    expect(getAnnouncement()).toBe('Picked up Home');
    moveTo(getRow('About us'), 0.9);
    expect(getAnnouncement()).toBe('After About us');
    moveTo(getRow('About us'));
    expect(getAnnouncement()).toBe('Inside About us');
    moveTo(getRow('Contact us'));
    expect(getAnnouncement()).toBe('Cannot drop here');
    moveTo(getRow('News'), 0.9);
    release();
    expect(getAnnouncement()).toBe('Dropped Home after News');
  });

  test('A drag announces a cancel and a refused drop', () => {
    saveTree();
    renderTree();

    startDrag(getRow('Home'));
    moveTo(getRow('About us'), 0.9);
    pressEscape();
    expect(getAnnouncement()).toBe('Cancelled the move of Home');
    release();

    startDrag(getRow('Home'));
    moveOutside();
    release();
    expect(getAnnouncement()).toBe('Cannot drop Home here');
  });

  test('A drag announces a new position at once when the rows move under a still pointer', () => {
    saveTree({ loadedIds: [2] });
    renderTree();

    startDrag(getRow('Home'));
    moveTo(getRow('News'), 0.1);
    expect(getAnnouncement()).toBe('Before News');
    // The children of About us show above News, so Our team is now under the pointer.
    act(() => getTreeStore(TREE_ID).dispatch({ type: ACTION_TYPES.EXPAND_ITEM, id: 2 }));

    expect(getAnnouncement()).toBe('Before Our team');
    pressEscape();
    release();
  });

  test('dnd-kit announces nothing in its own live region', () => {
    saveTree();
    renderTree();

    startDrag(getRow('Home'));
    moveTo(getRow('About us'), 0.9);
    release();

    const regions = [...document.querySelectorAll('[aria-live="assertive"]')];
    expect(regions.map((region) => region.textContent)).toEqual(['', 'Dropped Home after About us']);
  });
});

function getMenuItems() {
  return [{ id: 'edit', label: 'Edit', onSelect: jest.fn() }];
}

// Press `key` on the focused element. Return false when a handler prevented the default action.
function press(key, init = {}) {
  return fireEvent.keyDown(document.activeElement, { key, ...init });
}

// Start a keyboard move of the item `title` as the member does: focus its link, Shift+F10, then Enter on Move.
function startKeyboardMove(title) {
  focusLink(getRow(title));
  press('F10', { shiftKey: true });
  expect(document.activeElement.getAttribute('role')).toBe('menuitem');
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Move' }), { key: 'Enter' });
}

function getMenuLabels() {
  return screen.getAllByRole('menuitem').map((menuItem) => menuItem.textContent);
}

describe('Keyboard move', () => {
  test('The menu of an item has Move last when `onMove` is given', () => {
    saveTree();
    const { rerender } = render(
      <TreeView treeId={TREE_ID} label="Site pages" fetchChildren={getChildren} getMenuItems={getMenuItems} />,
    );
    fireEvent.contextMenu(getRow('About us'));
    expect(getMenuLabels()).toEqual(['Edit']);
    press('Escape');

    rerender(
      <TreeView
        treeId={TREE_ID}
        label="Site pages"
        fetchChildren={getChildren}
        getMenuItems={getMenuItems}
        onMove={jest.fn()}
      />,
    );
    fireEvent.contextMenu(getRow('About us'));
    expect(getMenuLabels()).toEqual(['Edit', 'Move']);
  });

  test('The menu of an item the member cannot view or cannot edit has no Move', () => {
    const store = getTreeStore(TREE_ID);
    loadActions(0, [makePage(1, 0, 'Home', { canView: false }), makePage(2, 0, 'About us', { canEdit: false })])
      .forEach(store.dispatch);
    renderTree({ getMenuItems });

    fireEvent.contextMenu(getRow('Home'));
    expect(getMenuLabels()).toEqual(['Edit']);
    press('Escape');
    fireEvent.contextMenu(getRow('About us'));
    expect(getMenuLabels()).toEqual(['Edit']);
  });

  test('A row with no host menu items gets no Move and keeps the browser menu', () => {
    saveTree();
    renderTree({ getMenuItems: () => [] });

    expect(fireEvent.contextMenu(getRow('About us'))).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('Move is disabled while a move is pending', () => {
    saveTree();
    renderTree({ getMenuItems, onMove: jest.fn(() => new Promise(() => {})) });

    dragTo(getRow('Home'), getRow('About us'), 0.9);
    fireEvent.contextMenu(getRow('Contact us'));

    expect(screen.getByRole('menuitem', { name: 'Move' }).getAttribute('aria-disabled')).toBe('true');
  });

  test('Move starts a keyboard move with focus on the link, and the arrow keys of the tree no longer move focus', () => {
    saveTree();
    renderTree({ getMenuItems });

    startKeyboardMove('About us');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(getRow('About us'));
    expect(getAnnouncement()).toBe(
      'Moving About us. Press the up and down arrows to choose a place, then Enter to drop or Escape to cancel.',
    );
    expect(press('End')).toBe(false);
    expect(press('ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(getRow('About us'));
  });

  test('A key during a keyboard move does not follow the link or open the menu', () => {
    saveTree();
    const onOpen = jest.fn();
    renderTree({ getMenuItems, onOpen });
    startKeyboardMove('About us');

    expect(press('F10', { shiftKey: true })).toBe(false);
    expect(press('x')).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  test.each([
    ['Escape', () => expect(press('Escape')).toBe(false)],
    ['Enter with no place marked', () => expect(press('Enter')).toBe(false)],
    ['Space with no place marked', () => expect(press(' ')).toBe(false)],
    ['Tab', () => expect(press('Tab')).toBe(true)],
    ['focus leaving the link', () => act(() => document.activeElement.blur())],
    ['a press outside the tree', () => {
      render(<button type="button">Outside</button>);
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    }],
  ])('%s cancels a keyboard move and calls no move', (_, cancel) => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems });
    startKeyboardMove('About us');

    cancel();

    expect(getAnnouncement()).toBe('Cancelled the move of About us');
    expect(onMove).not.toHaveBeenCalled();
    focusLink(getRow('About us'));
    press('ArrowDown');
    expect(document.activeElement).toBe(getRow('News'));
  });

  test('A held Enter from the menu does not cancel the keyboard move', () => {
    saveTree();
    renderTree({ getMenuItems });
    startKeyboardMove('About us');

    expect(press('Enter', { repeat: true })).toBe(false);

    expect(getAnnouncement()).toMatch(/^Moving About us/);
  });

  test('A reload that removes the moved item cancels the keyboard move', () => {
    saveTree();
    renderTree({ getMenuItems });
    startKeyboardMove('Contact us');

    act(() => loadActions(0, getChildren(0).slice(0, 3)).forEach(getTreeStore(TREE_ID).dispatch));

    expect(getAnnouncement()).toBe('Cancelled the move of Contact us');
  });

  test('A mouse press does not start a drag during a keyboard move', () => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems });
    startKeyboardMove('About us');

    dragTo(getRow('Home'), getRow('Contact us'), 0.9);

    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toMatch(/^Moving About us/);
  });

  test.each([
    ['a key on another element is left to the browser', () => {
      expect(fireEvent.keyDown(screen.getByRole('textbox', { name: 'Outside' }), { key: 'Enter' })).toBe(true);
    }],
    ['focus leaving the new link', () => act(() => document.activeElement.blur())],
  ])('After the row of the moved item mounts again, %s and cancels the move', (_, cancel) => {
    saveTree({ expandedIds: [2] });
    const { onMove } = renderTree({ getMenuItems });
    render(<input aria-label="Outside" />);
    startKeyboardMove('History');
    press('ArrowUp');
    const oldLink = getRow('History');

    // A reload moves History to the top level, so its row mounts again with a new link.
    act(() => [...loadActions(0, getChildrenAfterHistoryMove(0)), ...loadActions(2, getChildrenAfterHistoryMove(2))]
      .forEach(getTreeStore(TREE_ID).dispatch));
    expect(getRow('History')).not.toBe(oldLink);
    expect(document.activeElement).toBe(getRow('History'));
    cancel();

    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toBe('Cancelled the move of History');
  });

  test('After the row of the moved item mounts again, a focus out that leaves focus on the new link keeps the move', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('History');
    press('ArrowUp');

    act(() => [...loadActions(0, getChildrenAfterHistoryMove(0)), ...loadActions(2, getChildrenAfterHistoryMove(2))]
      .forEach(getTreeStore(TREE_ID).dispatch));
    fireEvent.focusOut(getRow('History'));

    expect(getAnnouncement()).not.toBe('Cancelled the move of History');
    expect(press('ArrowDown')).toBe(false);
    expect(getAnnouncement()).toBe('After Our team');
  });

  test.each([
    ['the title row collapses', () => {
      const toggle = document.querySelector('.tree-view__title-row .tree-view__toggle');
      fireEvent.mouseDown(toggle);
      fireEvent.click(toggle);
    }],
    ['`onMove` goes away', (rerenderWithoutMove) => rerenderWithoutMove()],
  ])('A keyboard move that ends because %s announces the cancel once', (_, end) => {
    saveTree();
    const props = {
      treeId: TREE_ID,
      label: 'Site pages',
      titleRowText: 'My site',
      fetchChildren: jest.fn((parentId) => Promise.resolve(getChildren(parentId))),
      getMenuItems,
    };
    const { rerender } = render(<TreeView {...props} onMove={jest.fn()} />);
    startKeyboardMove('About us');
    press('ArrowDown');
    const translate = jest.spyOn(i18n, '_t');

    end(() => rerender(<TreeView {...props} />));

    expect(getAnnouncement()).toBe('Cancelled the move of About us');
    expect(translate.mock.calls.filter(([key]) => key === 'Admin.TREEVIEW_DRAG_CANCELLED')).toHaveLength(1);
    translate.mockRestore();
  });

  test('A press on the scroll container of the tree, as on its scrollbar, does not cancel a keyboard move', () => {
    saveTree();
    render(
      <div data-testid="scroll-container" style={{ overflowY: 'auto' }}>
        <TreeView treeId={TREE_ID} label="Site pages" fetchChildren={getChildren} getMenuItems={getMenuItems} onMove={jest.fn()} />
      </div>,
    );
    startKeyboardMove('About us');

    fireEvent.mouseDown(screen.getByTestId('scroll-container'));

    expect(getAnnouncement()).toMatch(/^Moving About us/);
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside News');
  });

  test('The listeners of a keyboard move ignore events between a render without `onMove` and their removal', () => {
    saveTree();
    const errors = [];
    const handleError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', handleError);
    // React runs layout effects after a render and before the effects that remove the listeners.
    const DispatchOnCommit = ({ isOn }) => {
      useLayoutEffect(() => {
        if (isOn) {
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          ['mousedown', 'mousemove', 'click'].forEach((type) => document.body.dispatchEvent(
            new MouseEvent(type, { bubbles: true }),
          ));
        }
      }, [isOn]);
      return null;
    };
    const props = { treeId: TREE_ID, label: 'Site pages', fetchChildren: getChildren, getMenuItems };
    const { rerender } = render(<><TreeView {...props} onMove={jest.fn()} /><DispatchOnCommit isOn={false} /></>);
    startKeyboardMove('About us');

    rerender(<><TreeView {...props} /><DispatchOnCommit isOn /></>);

    window.removeEventListener('error', handleError);
    expect(errors).toEqual([]);
  });
});

// Return the announcement after each key in `keys`, pressed on the focused link.
function walkPlaces(keys) {
  return keys.map((key) => {
    press(key);
    return getAnnouncement();
  });
}

function getMarker() {
  return document.querySelector('.tree-view__drop-marker');
}

describe('Keyboard move places', () => {
  test('Down and Up step through the places top to bottom, one stop for each place, and do nothing at the ends', () => {
    saveTree();
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    expect(getMarker()).toBeNull();

    expect(walkPlaces(Array(7).fill('ArrowDown'))).toEqual([
      'Inside About us',
      'After About us',
      'Inside News',
      'After News',
      'Inside Contact us',
      'After Contact us',
      'After Contact us',
    ]);
    expect(walkPlaces(Array(6).fill('ArrowUp'))).toEqual([
      'Inside Contact us',
      'After News',
      'Inside News',
      'After About us',
      'Inside About us',
      'Inside About us',
    ]);
  });

  test('The first Up or Down goes to the nearest place above or below the item, skipping its branch and refused places', () => {
    saveTree({ expandedIds: [2] });
    const canDrop = jest.fn((item, { position, targetItem }) => !(position === 'inside' && targetItem.id === 4));
    renderTree({ getMenuItems, canDrop });
    startKeyboardMove('About us');

    expect(walkPlaces(['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'])).toEqual([
      'Inside News',
      'After News',
      'After Contact us',
      'After Contact us',
    ]);
    expect(canDrop.mock.calls.map(([item]) => item.id)).not.toContain(5);

    press('Escape');
    startKeyboardMove('About us');
    expect(walkPlaces(['ArrowUp', 'ArrowUp', 'ArrowUp'])).toEqual(['Inside Home', 'Before Home', 'Before Home']);
  });

  test('Home and End go to the first and the last place', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('History');

    expect(walkPlaces(['End', 'Home', 'Home'])).toEqual(['After Contact us', 'Before Home', 'Before Home']);
  });

  test('After an expanded parent is the place after its children', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');

    // Our team has children that are not loaded, so the move puts Home last inside Our team.
    expect(walkPlaces(['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'])).toEqual([
      'Before Our team',
      'Inside Our team',
      'After Our team',
      'Inside History',
      'After History',
      'After About us',
    ]);
  });

  test('The marker shows the marked place, and each step scrolls its row into view', () => {
    saveTree();
    renderTree({ getMenuItems });
    startKeyboardMove('Home');

    press('ArrowDown');

    expect(getMarker().className).toContain('tree-view__drop-marker--inside');
    expect(getMarker().style.top).toBe('30px');
    expect(Element.prototype.scrollIntoView.mock.instances.at(-1)).toBe(getRow('About us'));
    press('ArrowDown');
    press('ArrowDown');
    expect(getMarker().className).toContain('tree-view__drop-marker--inside');
    expect(getMarker().style.top).toBe('60px');
    expect(Element.prototype.scrollIntoView.mock.instances.at(-1)).toBe(getRow('News'));
  });

  test('A change of the tree keeps the marked place while it is allowed, and otherwise clears it with no announcement', () => {
    saveTree();
    let isAboutUsAllowed = true;
    renderTree({ getMenuItems, canDrop: (item, { targetItem }) => isAboutUsAllowed || targetItem.id !== 2 });
    startKeyboardMove('Home');
    press('ArrowDown');
    const store = getTreeStore(TREE_ID);

    // A new page above About us moves its row down.
    act(() => loadActions(0, [makePage(11, 0, 'New page'), ...getChildren(0)]).forEach(store.dispatch));
    expect(getMarker().style.top).toBe('60px');
    expect(getAnnouncement()).toBe('Inside About us');

    isAboutUsAllowed = false;
    act(() => loadActions(2, getChildren(2)).forEach(store.dispatch));
    expect(getMarker()).toBeNull();
    expect(getAnnouncement()).toBe('Inside About us');
    // `canDrop` refuses After About us, so Before News stands for that place.
    expect(press('ArrowDown')).toBe(false);
    expect(getAnnouncement()).toBe('Before News');
  });
});

describe('Keyboard move places off the arrow keys', () => {
  test.each([
    ['ArrowDown', 'After About us'],
    ['ArrowUp', 'Inside History'],
  ])('%s steps on from a marked place that the arrow keys do not reach', (key, nextPlace) => {
    saveTree({ loadedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');

    // Inside an expanded parent is not one of the arrow places. The same place is after the last child.
    act(() => getTreeStore(TREE_ID).dispatch({ type: ACTION_TYPES.EXPAND_ITEM, id: 2 }));
    expect(getAnnouncement()).toBe('Inside About us');
    press(key);

    expect(getAnnouncement()).toBe(nextPlace);
  });

  test('The marker after an expanded parent is below its branch in a keyboard move, and below its row in a drag', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');

    walkPlaces(Array(6).fill('ArrowDown'));

    expect(getAnnouncement()).toBe('After About us');
    // About us spans the rows from 30 to 120. TreeView.scss moves the marker of after down one row from its top.
    expect(getMarker().className).toContain('tree-view__drop-marker--after');
    expect(getMarker().style.top).toBe('90px');
    expect(Element.prototype.scrollIntoView.mock.instances.at(-1)).toBe(getRow('History'));
    press('Escape');

    startDrag(getRow('Home'));
    moveTo(getRow('About us'), 0.9);
    expect(getAnnouncement()).toBe('After About us');
    expect(getMarker().style.top).toBe('30px');
    pressEscape();
    release();
  });

  test('A key does nothing while the target of the marked move is gone, until the marked move is found again', async () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside Our team');
    const errors = [];
    const handleError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', handleError);

    // The store loses Our team, and the keys come before React renders the change.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadActions(2, getChildren(2).slice(1)).forEach(getTreeStore(TREE_ID).dispatch);
    ['ArrowRight', 'ArrowLeft', 'ArrowDown'].forEach((key) => document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    ));
    window.removeEventListener('error', handleError);
    await flush();
    consoleError.mockRestore();

    expect(errors).toEqual([]);
    expect(getAnnouncement()).toBe('Inside Our team');
  });
});

describe('Keyboard move drop', () => {
  test.each([['Enter'], [' ']])('%p drops at the marked place with the move a pointer drop sends', async (key) => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');
    press('ArrowDown');

    expect(press(key)).toBe(false);

    expect(onMove.mock.calls).toEqual([[
      expect.objectContaining({ id: 1, treeTitle: 'Home' }),
      { parentId: 0, position: 'after', targetId: 2, siblingIds: [2, 1, 3, 4] },
    ]]);
    expect(getAnnouncement()).toBe('Dropped Home after About us');
    expect(getMarker()).toBeNull();
    expect(document.activeElement).toBe(getRow('Home'));
    await flush();
  });

  test('A drop inside an item expands it, as a pointer drop does', async () => {
    saveTree({ loadedIds: [2] });
    const { onMove } = renderTree({ getMenuItems });
    startKeyboardMove('Contact us');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(getAnnouncement()).toBe('Inside About us');

    press('Enter');

    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4 }),
      { parentId: 2, position: 'inside', targetId: 2, siblingIds: [5, 6, 4] },
    );
    expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
    await flush();
  });

  test('A drop that `canDrop` refuses at the time of the drop calls no move', () => {
    saveTree();
    let isAllowed = true;
    const { onMove } = renderTree({ getMenuItems, canDrop: () => isAllowed });
    startKeyboardMove('Home');
    press('ArrowDown');

    isAllowed = false;
    press('Enter');

    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toBe('Cannot drop Home here');
  });

  test('The moved item takes focus in its new place after the reload of a keyboard drop', async () => {
    saveTree({ expandedIds: [2] });
    const { onMove, reload, respond } = renderReloadingTree({ getMenuItems });
    startKeyboardMove('History');
    walkPlaces(['Home', 'ArrowDown', 'ArrowDown']);
    expect(getAnnouncement()).toBe('After Home');

    press('Enter');
    expect(onMove.mock.calls[0][1]).toEqual({ parentId: 0, position: 'after', targetId: 1, siblingIds: [1, 6, 2, 3, 4] });
    await flush();
    reload();
    await respond(2, getChildrenAfterHistoryMove(2));
    await respond(0, getChildrenAfterHistoryMove(0));

    const history = getRow('History');
    expect(history.getAttribute('aria-level')).toBe('1');
    expect(getTabStop()).toBe(history);
    expect(document.activeElement).toBe(history);
  });

  test('A keyboard drop whose `onMove` resolves to false leaves focus on the item where it was', async () => {
    saveTree({ expandedIds: [2] });
    const { reload, respond } = renderReloadingTree({ getMenuItems, onMove: jest.fn(() => Promise.resolve(false)) });
    startKeyboardMove('History');
    walkPlaces(['Home', 'ArrowDown', 'ArrowDown']);

    press('Enter');
    await flush();
    reload();
    await respond(2, getChildren(2));
    await respond(0, getChildren(0));

    const history = getRow('History');
    expect(history.getAttribute('aria-level')).toBe('2');
    expect(getTabStop()).toBe(history);
    expect(document.activeElement).toBe(history);
  });
});

describe('Keyboard move expand and collapse', () => {
  test('Right on a place inside a collapsed parent loads its children once and marks the first place inside it', async () => {
    saveTree();
    const { fetchChildren } = renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside About us');

    expect(press('ArrowRight')).toBe(false);
    expect(getAnnouncement()).toBe('Inside About us');
    await flush();

    expect(fetchChildren.mock.calls.filter(([parentId]) => parentId === 2)).toHaveLength(1);
    expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
    expect(getAnnouncement()).toBe('Before Our team');
    expect(getMarker().style.top).toBe('60px');
    expect(document.activeElement).toBe(getRow('Home'));
  });

  test('Right on a parent whose children are loaded marks the first place inside it at once', () => {
    saveTree({ loadedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');

    press('ArrowRight');

    expect(getAnnouncement()).toBe('Before Our team');
  });

  test('Right on a place that is not inside a collapsed parent does nothing', () => {
    saveTree();
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');
    press('ArrowDown');

    press('ArrowRight');

    expect(getAnnouncement()).toBe('After About us');
    expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
  });

  test('Left on a place among the children of a parent collapses the parent and marks the place inside it', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    press('ArrowDown');
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside Our team');

    expect(press('ArrowLeft')).toBe(false);

    expect(getRow('About us').getAttribute('aria-expanded')).toBe('false');
    expect(getAnnouncement()).toBe('Inside About us');
    expect(getMarker().className).toContain('tree-view__drop-marker--inside');
    expect(getMarker().style.top).toBe('30px');
  });

  test('Left does not collapse a parent of the moved item', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('History');
    press('ArrowUp');
    press('ArrowUp');
    expect(getAnnouncement()).toBe('Before Our team');

    press('ArrowLeft');

    expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
    expect(getAnnouncement()).toBe('Before Our team');
    expect(document.activeElement).toBe(getRow('History'));
  });

  test('Left does nothing when `canDrop` refuses the place inside the parent', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems, canDrop: (item, { position, targetItem }) => position !== 'inside' || targetItem.id !== 2 });
    startKeyboardMove('Home');
    press('ArrowDown');
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside Our team');

    press('ArrowLeft');

    expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
    expect(getAnnouncement()).toBe('Inside Our team');
    expect(getMarker().className).toContain('tree-view__drop-marker--inside');
  });
});

// Get the point at `rowOffset` of the height of the link `link`, as the coordinates of a mouse event.
function getLinkPoint(link, rowOffset) {
  const rect = link.getBoundingClientRect();
  return { clientX: rect.left + 10, clientY: rect.top + rect.height * rowOffset };
}

// Get the toggle of an item. The toggle is hidden from assistive technology, so a role query does not find it.
function getToggle(title) {
  return document.querySelector(`.tree-view__toggle[aria-label="Toggle children of ${title}"]`);
}

describe('Keyboard move with a pointer', () => {
  test('After Move, the marker follows the pointer by the thirds of a row, and a click on a row drops there', () => {
    saveTree();
    const onOpen = jest.fn();
    const { onMove } = renderTree({ getMenuItems, onOpen });
    startKeyboardMove('Home');

    fireEvent.mouseMove(getRow('About us'), getLinkPoint(getRow('About us'), 0.9));
    expect(getAnnouncement()).toBe('After About us');
    expect(getMarker().className).toContain('tree-view__drop-marker--after');
    const contactUs = getRow('Contact us');
    expect(fireEvent.mouseDown(contactUs, { button: 0, ...getLinkPoint(contactUs, 0.1) })).toBe(false);
    expect(fireEvent.click(contactUs, { button: 0, ...getLinkPoint(contactUs, 0.1) })).toBe(false);

    expect(onMove.mock.calls).toEqual([[
      expect.objectContaining({ id: 1 }),
      { parentId: 0, position: 'before', targetId: 4, siblingIds: [2, 3, 1, 4] },
    ]]);
    expect(getAnnouncement()).toBe('Dropped Home before Contact us');
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(getRow('Home'));
  });

  test('After Move, a click on a row that `canDrop` refuses calls no move', () => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems, canDrop: (item, { targetItem }) => targetItem.id !== 4 });
    startKeyboardMove('Home');

    const contactUs = getRow('Contact us');
    fireEvent.click(contactUs, { button: 0, ...getLinkPoint(contactUs, 0.5) });

    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toBe('Cannot drop Home here');
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Cannot drop Home here');
  });

  test('After Move, a click on a toggle expands the item and the move goes on', async () => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems });
    startKeyboardMove('Home');

    fireEvent.mouseDown(getToggle('About us'));
    fireEvent.click(getToggle('About us'));
    await flush();

    expect(getRow('About us').getAttribute('aria-expanded')).toBe('true');
    expect(onMove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(getRow('Home'));
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Before Our team');
  });

  test('After Move, the too-many row acts as usual and the move goes on', () => {
    saveTree({ expandedIds: [3] });
    const onShowAsList = jest.fn();
    const { onMove } = renderTree({ getMenuItems, onShowAsList });
    startKeyboardMove('Home');

    const showAsList = screen.getByRole('treeitem', { name: /show as list/ });
    const point = getLinkPoint(showAsList, 0.5);
    fireEvent.mouseMove(showAsList, point);
    fireEvent.mouseDown(showAsList, { button: 0, ...point });
    fireEvent.click(showAsList, { button: 0, ...point });

    expect(onShowAsList).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toMatch(/^Moving Home/);
    press('ArrowDown');
    expect(getAnnouncement()).toBe('Inside About us');
  });

  test('After Move, a pointer puts the marker after an expanded parent below the row of the parent, as a drag does', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');

    fireEvent.mouseMove(getRow('About us'), getLinkPoint(getRow('About us'), 0.9));

    expect(getAnnouncement()).toBe('After About us');
    expect(getMarker().style.top).toBe('30px');
  });

  test('A place after an expanded parent that the arrow keys marked keeps its marker over a change of the store', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    walkPlaces(Array(6).fill('ArrowDown'));
    expect(getAnnouncement()).toBe('After About us');

    act(() => loadActions(5, getChildren(5)).forEach(getTreeStore(TREE_ID).dispatch));

    expect(getMarker().style.top).toBe('90px');
  });

  test('After a pointer marks the place after an expanded parent, Up and Down back to it put the marker below its branch', () => {
    saveTree({ expandedIds: [2] });
    renderTree({ getMenuItems });
    startKeyboardMove('Home');
    fireEvent.mouseMove(getRow('About us'), getLinkPoint(getRow('About us'), 0.9));
    expect(getMarker().style.top).toBe('30px');

    press('ArrowUp');
    press('ArrowDown');

    expect(getAnnouncement()).toBe('After About us');
    expect(getMarker().style.top).toBe('90px');
    act(() => loadActions(5, getChildren(5)).forEach(getTreeStore(TREE_ID).dispatch));
    expect(getMarker().style.top).toBe('90px');
  });

  test('After Move, a click outside the tree cancels the move', () => {
    saveTree();
    const { onMove } = renderTree({ getMenuItems });
    render(<button type="button">Outside</button>);
    startKeyboardMove('Home');
    press('ArrowDown');

    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);

    expect(onMove).not.toHaveBeenCalled();
    expect(getAnnouncement()).toBe('Cancelled the move of Home');
    expect(getMarker()).toBeNull();
  });
});

describe('Touch drag', () => {
  // The tree starts a touch drag after a hold of 250 ms, as `TOUCH_ACTIVATION_CONSTRAINT` sets.
  const HOLD = 250;

  afterEach(() => {
    // The unmount ends a stop of the click after a touch drag, so the next test starts with no stop.
    cleanup();
  });

  // Hold a finger on `link` until the drag starts, then lift it with no move.
  function holdAndRelease(link) {
    pressTouch(link);
    act(() => jest.advanceTimersByTime(HOLD));
    releaseTouch(link);
  }

  // Drag `link` by touch to the bottom third of `targetLink` and release it there. The browser sends no click after a
  // touch that moved. Then wait past the stop of clicks that `@dnd-kit/core` keeps after a drag.
  function touchDragTo(link, targetLink) {
    pressTouch(link);
    act(() => jest.advanceTimersByTime(HOLD));
    moveTouchTo(link, targetLink, 0.9);
    releaseTouch(link);
    act(() => jest.advanceTimersByTime(CLICK_GUARD_WAIT));
  }

  test('A touch held for 250 ms drags the item, and the release moves it', () => {
    jest.useFakeTimers();
    saveTree();
    const { onMove } = renderTree();
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD - 1));
    expect(getAnnouncement()).toBe('');
    act(() => jest.advanceTimersByTime(1));
    expect(getAnnouncement()).toBe('Picked up Home');
    moveTouchTo(home, getRow('About us'), 0.9);
    // The overlay is 5px to the right of the finger and 10px below it, as for a mouse pointer. The finger is at 30, 55
    // and the link of Home starts at 20, 3.
    expect(document.querySelector('.tree-view__drag-overlay').parentElement.style.transform)
      .toMatch(/^translate3d\(15px, 62px,/);
    releaseTouch(home);

    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { parentId: 0, position: 'after', targetId: 2, siblingIds: [2, 1, 3, 4] },
    );
  });

  test('A touch that moves more than 5px before 250 ms is a swipe and drags nothing', () => {
    jest.useFakeTimers();
    saveTree();
    const { onMove } = renderTree();
    const home = getRow('Home');

    pressTouch(home);
    moveTouchBy(home, 6);
    act(() => jest.advanceTimersByTime(HOLD));
    moveTouchTo(home, getRow('About us'), 0.9);
    releaseTouch(home);

    expect(getAnnouncement()).toBe('');
    expect(onMove).not.toHaveBeenCalled();
  });

  test('A tap opens the item. The click after a touch drag does not, and the next tap does', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    expect(tap(home)).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);

    holdAndRelease(home);
    // The browser can send the click of the touch later than a timeout of 0 ms.
    act(() => jest.advanceTimersByTime(100));
    expect(fireEvent.click(home, { button: 0 })).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);

    tap(home);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  test('A long press on touch opens no context menu, and a right-click and the Menu key still do', () => {
    jest.useFakeTimers();
    saveTree();
    renderTree({ getMenuItems });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    fireEvent.contextMenu(home);
    expect(screen.queryByRole('menu')).toBeNull();
    releaseTouch(home);

    fireEvent.mouseDown(home, { button: 2 });
    fireEvent.contextMenu(home);
    expect(screen.getByRole('menu')).toBeTruthy();
    press('Escape');

    pressTouch(home);
    releaseTouch(home);
    fireEvent.keyDown(home, { key: 'ContextMenu' });
    fireEvent.contextMenu(home);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  test('A `contextmenu` event after the release of a long press opens no menu, and its default is prevented', () => {
    jest.useFakeTimers();
    saveTree();
    renderTree({ getMenuItems });
    const home = getRow('Home');

    holdAndRelease(home);

    expect(fireEvent.contextMenu(home)).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('The click after the release of a touch drag that Escape cancelled does not open the item', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    const { onMove } = renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    releaseTouch(home);
    act(() => jest.advanceTimersByTime(100));

    expect(fireEvent.click(home, { button: 0 })).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  test('After a touch drag that sends no click, the next tap opens the item', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });

    touchDragTo(getRow('Home'), getRow('About us'));

    expect(tap(getRow('Contact us'))).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After a touch drag that sends no click, a key press ends the stop of the click', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const contactUs = getRow('Contact us');

    touchDragTo(getRow('Home'), getRow('About us'));
    // Enter on a link sends a click with no press of a pointer.
    fireEvent.keyDown(contactUs, { key: 'Enter' });
    fireEvent.click(contactUs, { button: 0 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After a touch drag, a click outside the tree is not stopped', () => {
    jest.useFakeTimers();
    saveTree();
    renderTree();
    const button = document.body.appendChild(document.createElement('button'));
    const handleClick = jest.fn();
    button.addEventListener('click', handleClick);

    touchDragTo(getRow('Home'), getRow('About us'));
    const isClickAllowed = fireEvent.click(button);
    button.remove();

    expect(isClickAllowed).toBe(true);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('The stop of the click after a touch drag ends 1 s after the finger lifts', async () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    // A move that resolves to false clears the move with no reload, so the next drag can start.
    renderTree({ onOpen, onMove: jest.fn(() => Promise.resolve(false)) });
    const contactUs = getRow('Contact us');

    touchDragTo(getRow('Home'), getRow('About us'));
    act(() => jest.advanceTimersByTime(999 - CLICK_GUARD_WAIT));
    expect(fireEvent.click(contactUs, { button: 0 })).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => {});

    touchDragTo(getRow('Home'), getRow('About us'));
    act(() => jest.advanceTimersByTime(1000 - CLICK_GUARD_WAIT));
    fireEvent.click(contactUs, { button: 0 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After Escape, the stop of the click lasts until 1 s after the finger lifts, whatever keys come first', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', repeat: true });
    fireEvent.keyDown(document, { key: 'Shift', code: 'ShiftLeft' });
    act(() => jest.advanceTimersByTime(1300));
    releaseTouch(home);
    act(() => jest.advanceTimersByTime(100));

    expect(fireEvent.click(home, { button: 0 })).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test('After Escape, the stop of the click ends 1 s after the finger lifts', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    act(() => jest.advanceTimersByTime(1300));
    releaseTouch(home);
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.click(home, { button: 0 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After Escape, a `touchcancel` counts as the lift of the finger', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    fireEvent.touchCancel(home, { touches: [], changedTouches: [] });
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.click(home, { button: 0 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After Escape, the stop of the click ends after 10 s when no lift of the finger comes', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    // The first click ends the stop, so a second drag checks the end of the stop.
    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    act(() => jest.advanceTimersByTime(9999));
    expect(fireEvent.click(home, { button: 0 })).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    act(() => jest.advanceTimersByTime(10000));
    fireEvent.click(home, { button: 0 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After Escape, a lift just before 10 s still gets its full 1 s', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    pressEscape();
    act(() => jest.advanceTimersByTime(9500));
    releaseTouch(home);
    act(() => jest.advanceTimersByTime(600));

    expect(fireEvent.click(home, { button: 0 })).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test('After the browser cancels a touch drag, the stop of the click ends 1 s later', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const home = getRow('Home');

    pressTouch(home);
    act(() => jest.advanceTimersByTime(HOLD));
    fireEvent.touchCancel(home, { touches: [], changedTouches: [] });
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.click(home, { button: 0 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('After a touch drag, the first click ends the stop even when it is outside the tree', () => {
    jest.useFakeTimers();
    saveTree();
    const onOpen = jest.fn();
    renderTree({ onOpen });
    const button = document.body.appendChild(document.createElement('button'));

    touchDragTo(getRow('Home'), getRow('About us'));
    fireEvent.click(button);
    button.remove();
    fireEvent.click(getRow('Contact us'), { button: 0 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('No touch drag starts while a move is pending', () => {
    jest.useFakeTimers();
    saveTree();
    const { onMove } = renderTree({ getMenuItems, onMove: jest.fn(() => new Promise(() => {})) });
    const contactUs = getRow('Contact us');

    dragTo(getRow('Home'), getRow('About us'), 0.9);
    pressTouch(contactUs);
    act(() => jest.advanceTimersByTime(HOLD));
    expect(getAnnouncement()).toBe('Dropped Home after About us');
    releaseTouch(contactUs);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  test('No touch drag starts while a keyboard move is in progress', () => {
    jest.useFakeTimers();
    saveTree();
    renderTree({ getMenuItems });
    const contactUs = getRow('Contact us');
    startKeyboardMove('About us');
    const announcement = getAnnouncement();

    pressTouch(contactUs);
    act(() => jest.advanceTimersByTime(HOLD));

    expect(getAnnouncement()).toBe(announcement);
    expect(document.activeElement).toBe(getRow('About us'));
    releaseTouch(contactUs);
  });
});
