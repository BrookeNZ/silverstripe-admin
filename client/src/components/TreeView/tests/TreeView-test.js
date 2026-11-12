/* global jest, test, expect, beforeEach */
import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import i18n from 'i18n';
import { getTreeStore, treeStores } from '../treeStore';
import TreeView from '../TreeView';
import { deferred, getChildren, getNode, getPath, loadActions, makePage } from './mockTree';

const TREE = 'pages';

function seedTree(actions) {
  const store = getTreeStore(TREE);
  actions.forEach(store.dispatch);
}

// Stores a tree with the given parents loaded from the mock tree and open, as an earlier mount would have left it
function saveTree({ openIds = [], revealedId = null, actions = [] } = {}) {
  seedTree([
    ...[0, ...openIds].flatMap((parentId) => loadActions(parentId, getChildren(parentId))),
    ...openIds.map((id) => ({ type: 'expandNode', id })),
    ...actions,
    ...(revealedId === null ? [] : [{ type: 'revealRequest', id: revealedId }]),
  ]);
}

function makeProps(obj = {}) {
  return {
    treeId: TREE,
    label: 'Site pages',
    rootTitle: 'My site',
    fetchChildren: jest.fn((parentId) => Promise.resolve(getChildren(parentId))),
    ...obj,
  };
}

function renderTree(props) {
  const result = render(<TreeView {...props} />);
  const rerender = (newProps) => result.rerender(<TreeView {...newProps} />);
  return { ...result, rerender };
}

function flush() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function getItem(name) {
  return screen.getByRole('treeitem', { name });
}

function queryItem(name) {
  return screen.queryByRole('treeitem', { name });
}

// The toggle is hidden from assistive technology, so it is found beside its item
function getToggle(name) {
  return getItem(name).parentElement.querySelector('.tree-view__toggle');
}

function getRootToggle() {
  return document.querySelector('.tree-view__root > .tree-view__toggle');
}

// jsdom reports each link it cannot follow; only that report is dropped, after the click's navigation has run
async function withoutNavigationReport(callback) {
  // eslint-disable-next-line no-console
  const consoleError = console.error;
  const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (!String(args[0] && args[0].message).startsWith('Not implemented: navigation')) {
      consoleError(...args);
    }
  });
  try {
    callback();
    await flush();
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  treeStores.clear();
  Element.prototype.scrollIntoView = jest.fn();
});

test('TreeView renders the stored rows with the tree markup and makes no request', () => {
  saveTree({ openIds: [2], revealedId: 6, actions: loadActions(5, getChildren(5)) });
  const props = makeProps({ currentId: 6, className: 'cms-tree-view' });
  renderTree(props);

  const nav = screen.getByRole('navigation', { name: 'Site pages' });
  expect([...nav.classList]).toEqual(['tree-view', 'cms-tree-view']);
  const root = nav.querySelector(':scope > .tree-view__root');
  expect([...root.classList]).toEqual(['tree-view__root', 'tree-view__root--open']);
  expect(root.textContent).toBe('My site');
  const tree = screen.getByRole('tree', { name: 'Site pages' });
  expect(tree.parentElement).toBe(nav);
  expect([...tree.classList]).toEqual(['tree-view__list']);

  const leaf = getItem('Contact us Modified');
  const item = leaf.parentElement;
  expect(item.tagName).toBe('LI');
  expect(item.getAttribute('role')).toBe('none');
  expect(item.getAttribute('data-id')).toBe('4');
  expect(item.getAttribute('data-recordtype')).toBe('Page');
  expect([...item.classList]).toEqual(['tree-view__item', 'class-Page', 'status-modified']);
  expect(item.querySelector('.tree-view__toggle')).toBeNull();
  expect(leaf.className).toBe('tree-view__link');
  expect(leaf.getAttribute('href')).toBe('admin/pages/edit/show/4');
  expect(leaf.getAttribute('title')).toBe('(Record type: Page) Contact us');
  expect(leaf.getAttribute('aria-selected')).toBe('false');
  expect(leaf.getAttribute('aria-level')).toBe('1');
  expect(leaf.getAttribute('aria-posinset')).toBe('4');
  expect(leaf.getAttribute('aria-setsize')).toBe('4');
  expect(leaf.hasAttribute('aria-expanded')).toBe(false);
  expect(leaf.hasAttribute('aria-current')).toBe(false);
  const [icon, title, badge] = leaf.children;
  expect(icon.className).toBe('jstree-recordicon record-icon font-icon-page class-Page');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
  expect(title.className).toBe('tree-view__title');
  expect(title.textContent).toBe('Contact us');
  expect(badge.className).toBe('badge status-modified');
  expect(badge.getAttribute('title')).toBe('Item has unpublished changes');

  const parent = getItem('About us');
  expect(parent.getAttribute('aria-expanded')).toBe('true');
  expect([...parent.parentElement.classList]).toEqual(['tree-view__item', 'tree-view__item--open', 'class-Page']);
  expect(getToggle('About us').getAttribute('aria-hidden')).toBe('true');
  const group = screen.getByRole('group', { name: 'About us' });
  expect(group.parentElement).toBe(parent.parentElement);
  expect([...group.classList]).toEqual(['tree-view__group']);
  expect(getItem('History Draft').getAttribute('aria-level')).toBe('2');
  expect(getItem('History Draft').getAttribute('aria-current')).toBe('page');
  expect(getItem('Our team').getAttribute('aria-expanded')).toBe('false');
  expect([...getItem('Our team').parentElement.classList]).toEqual(['tree-view__item', 'class-Page']);
  expect(queryItem('Jane Doe')).toBeNull();

  fireEvent.click(getToggle('Our team'));
  const externalBadge = within(getItem('Staff intranet External')).getByText('External');
  expect(externalBadge.className).toBe('badge status-externallink');
  expect(externalBadge.hasAttribute('title')).toBe(false);

  expect(props.fetchChildren).not.toHaveBeenCalled();
});

test('TreeView collapses and opens the whole tree from the root row', () => {
  saveTree();
  const { container } = renderTree(makeProps());
  const root = container.querySelector('.tree-view__root');
  expect(getRootToggle().getAttribute('aria-hidden')).toBe('true');

  fireEvent.click(getRootToggle());
  expect([...root.classList]).toEqual(['tree-view__root']);
  expect(screen.queryByRole('tree')).toBeNull();

  fireEvent.click(getRootToggle());
  expect([...root.classList]).toEqual(['tree-view__root', 'tree-view__root--open']);
  expect(screen.getAllByRole('treeitem')).toHaveLength(4);
});

test('TreeView shows the top level without a root row when there is no root title', () => {
  saveTree({ actions: [{ type: 'collapseNode', id: 0 }] });
  const { container } = renderTree(makeProps({ rootTitle: '' }));

  expect(container.querySelector('.tree-view__root')).toBeNull();
  expect(screen.getAllByRole('treeitem')).toHaveLength(4);
});

test('TreeView loads the top level on its first mount and shows a loading row meanwhile', async () => {
  const response = deferred();
  const fetchChildren = jest.fn(() => response.promise);
  const { container } = renderTree(makeProps({ fetchChildren }));

  expect(fetchChildren.mock.calls).toEqual([[0]]);
  const tree = screen.getByRole('tree');
  expect(tree.getAttribute('aria-busy')).toBe('true');
  const loading = container.querySelector('.tree-view__item--loading');
  expect(loading.getAttribute('role')).toBe('none');
  expect(loading.textContent).toBe('Loading...');
  expect(screen.queryAllByRole('treeitem')).toEqual([]);

  response.resolve(getChildren(0));
  await flush();

  expect(tree.hasAttribute('aria-busy')).toBe(false);
  expect(container.querySelector('.tree-view__item--loading')).toBeNull();
  expect(screen.getAllByRole('treeitem')).toHaveLength(4);
});

test('TreeView loads children on the first expand only, marking the parent busy meanwhile', async () => {
  saveTree();
  const response = deferred();
  const props = makeProps({ fetchChildren: jest.fn(() => response.promise) });
  renderTree(props);

  fireEvent.click(getToggle('About us'));
  expect(props.fetchChildren.mock.calls).toEqual([[2]]);
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('true');
  expect(getItem('About us').getAttribute('aria-busy')).toBe('true');
  const group = screen.getByRole('group', { name: 'About us' });
  expect(group.querySelector('.tree-view__item--loading').textContent).toBe('Loading...');

  response.resolve(getChildren(2));
  await flush();
  expect(getItem('About us').hasAttribute('aria-busy')).toBe(false);
  expect(getItem('Our team')).not.toBeNull();

  fireEvent.click(getToggle('About us'));
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
  expect(queryItem('Our team')).toBeNull();
  fireEvent.click(getToggle('About us'));
  await flush();

  expect(props.fetchChildren).toHaveBeenCalledTimes(1);
  expect(getItem('Our team')).not.toBeNull();
});

test('TreeView loads the children of an expanded node the server sent as a leaf', async () => {
  saveTree({ actions: [{ type: 'expandNode', id: 4 }] });
  const props = makeProps({ fetchChildren: jest.fn(() => Promise.resolve([makePage(10, 4, 'Directions')])) });
  renderTree(props);

  expect(getItem('Contact us Modified').getAttribute('aria-expanded')).toBe('true');
  expect(props.fetchChildren.mock.calls).toEqual([[4]]);
  await flush();
  expect(getItem('Directions')).not.toBeNull();
});

test('TreeView shows a parent whose children turn out empty as a leaf', async () => {
  saveTree();
  renderTree(makeProps({ fetchChildren: jest.fn(() => Promise.resolve([])) }));

  fireEvent.click(getToggle('About us'));
  await flush();

  const parent = getItem('About us');
  expect(parent.hasAttribute('aria-expanded')).toBe(false);
  expect(getToggle('About us')).toBeNull();
  expect(parent.parentElement.classList.contains('tree-view__item--open')).toBe(false);
  expect(screen.queryByRole('group')).toBeNull();
});

test('TreeView shows a failed row that retries only when activated', async () => {
  saveTree();
  const fetchChildren = jest.fn()
    .mockImplementationOnce(() => Promise.reject(new Error('Server error')))
    .mockImplementation((parentId) => Promise.resolve(getChildren(parentId)));
  renderTree(makeProps({ fetchChildren }));

  fireEvent.click(getToggle('About us'));
  await flush();

  const failed = getItem('Failed to load Try again');
  expect(failed.tagName).toBe('BUTTON');
  expect(failed.parentElement.className).toBe('tree-view__item tree-view__item--failed');
  expect(failed.getAttribute('aria-level')).toBe('2');
  expect(failed.getAttribute('aria-selected')).toBe('false');
  expect(getItem('About us').hasAttribute('aria-busy')).toBe(false);

  fireEvent.click(getToggle('About us'));
  fireEvent.click(getToggle('About us'));
  await flush();
  expect(fetchChildren).toHaveBeenCalledTimes(1);

  fireEvent.click(getItem('Failed to load Try again'));
  await flush();

  expect(fetchChildren.mock.calls).toEqual([[2], [2]]);
  expect(getItem('Our team')).not.toBeNull();
  expect(queryItem('Failed to load Try again')).toBeNull();
});

test('TreeView shows a limited parent a row that calls onShowAsList and never loads its children', async () => {
  saveTree();
  const onShowAsList = jest.fn();
  const props = makeProps({ onShowAsList });
  const { rerender } = renderTree(props);

  fireEvent.click(getToggle('News'));

  expect(props.fetchChildren).not.toHaveBeenCalled();
  const parent = getItem('News');
  expect(parent.getAttribute('aria-expanded')).toBe('true');
  expect(parent.hasAttribute('aria-busy')).toBe(false);
  const row = getItem('show as list');
  expect(row.parentElement.className).toBe('tree-view__item tree-view__item--limited');
  expect(row.parentElement.textContent).toBe('Too many records (show as list)');
  expect(row.getAttribute('href')).toBe('admin/pages?ParentID=3');
  expect(row.getAttribute('aria-level')).toBe('2');
  expect(row.getAttribute('aria-selected')).toBe('false');

  await withoutNavigationReport(() => {
    expect(fireEvent.click(row, { ctrlKey: true })).toBe(true);
  });
  expect(onShowAsList).not.toHaveBeenCalled();

  expect(fireEvent.click(row)).toBe(false);
  expect(onShowAsList).toHaveBeenCalledTimes(1);
  expect(onShowAsList.mock.calls[0][0]).toEqual(getNode(3));
  expect(onShowAsList.mock.calls[0][1].type).toBe('click');

  rerender({ ...props, onShowAsList: null });
  await withoutNavigationReport(() => {
    expect(fireEvent.click(getItem('show as list'))).toBe(true);
  });
});

function withTooManyText(text, callback) {
  const translate = i18n._t;
  const spy = jest.spyOn(i18n, '_t').mockImplementation((key, fallback) => (
    key === 'Admin.TREEVIEW_TOO_MANY' ? text : translate.call(i18n, key, fallback)
  ));
  try {
    callback();
  } finally {
    spy.mockRestore();
  }
}

test('TreeView places the show as list link in a translation with one placeholder, none or two', () => {
  [
    ['{link} first', 'show as list first'],
    ['Too many records', 'Too many records show as list'],
    ['A {link} B {link} C', 'A show as list B  C'],
  ].forEach(([text, shown]) => {
    withTooManyText(text, () => {
      treeStores.clear();
      saveTree({ actions: [{ type: 'expandNode', id: 3 }] });
      const { unmount } = renderTree(makeProps());
      expect(getItem('show as list').parentElement.textContent).toBe(shown);
      unmount();
    });
  });
});

test('TreeView calls onOpen on a plain click only, and leaves other clicks to the browser', async () => {
  saveTree();
  const onOpen = jest.fn();
  const props = makeProps({ onOpen });
  const { rerender } = renderTree(props);
  const link = getItem('Contact us Modified');

  fireEvent.keyDown(link, { key: 'Enter' });
  fireEvent.click(getToggle('About us'));
  await withoutNavigationReport(() => {
    [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }].forEach((modifier) => {
      expect(fireEvent.click(link, modifier)).toBe(true);
    });
  });
  expect(onOpen).not.toHaveBeenCalled();

  expect(fireEvent.click(link)).toBe(false);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen.mock.calls[0][0]).toEqual(getNode(4));
  expect(onOpen.mock.calls[0][1].type).toBe('click');

  rerender({ ...props, onOpen: null });
  await withoutNavigationReport(() => {
    expect(fireEvent.click(getItem('Contact us Modified'))).toBe(true);
  });
});

test('TreeView stops a plain click on a disabled node and does nothing else', async () => {
  saveTree({ openIds: [2, 5] });
  const onOpen = jest.fn();
  const { rerender } = renderTree(makeProps({ onOpen }));
  const link = getItem('Private profile');
  expect(link.getAttribute('href')).toBe('admin/pages/edit/show/9');
  expect(link.getAttribute('aria-disabled')).toBe('true');
  expect(getItem('Jane Doe').hasAttribute('aria-disabled')).toBe(false);

  expect(fireEvent.click(link)).toBe(false);
  await withoutNavigationReport(() => {
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
  });
  expect(onOpen).not.toHaveBeenCalled();

  rerender(makeProps());
  expect(fireEvent.click(getItem('Private profile'))).toBe(false);
});

test('TreeView calls the latest callbacks', async () => {
  saveTree();
  const first = jest.fn();
  const latest = jest.fn();
  const props = makeProps({ onOpen: first });
  const { rerender } = renderTree(props);

  rerender({ ...props, onOpen: latest });
  fireEvent.click(getItem('Contact us Modified'));
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);

  const fetchChildren = jest.fn((parentId) => Promise.resolve(getChildren(parentId)));
  rerender({ ...props, onOpen: latest, fetchChildren });
  fireEvent.click(getToggle('About us'));
  await flush();
  expect(props.fetchChildren).not.toHaveBeenCalled();
  expect(fetchChildren.mock.calls).toEqual([[2]]);
});

test('TreeView marks the current row from the prop, given as a number or a string', () => {
  saveTree({ openIds: [2] });
  const { rerender } = renderTree(makeProps({ currentId: 6 }));
  expect(getItem('History Draft').getAttribute('aria-current')).toBe('page');
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);

  rerender(makeProps({ currentId: '4' }));
  expect(getItem('Contact us Modified').getAttribute('aria-current')).toBe('page');
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);

  rerender(makeProps({ currentId: null }));
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);

  const fetchPath = jest.fn(() => Promise.resolve([]));
  rerender(makeProps({ currentId: 0, fetchPath }));
  rerender(makeProps({ currentId: '0', fetchPath }));
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  expect(fetchPath).not.toHaveBeenCalled();
});

test('TreeView opens the collapsed ancestors of a stored current page without fetchPath', () => {
  saveTree({ openIds: [2, 5] });
  const fetchPath = jest.fn(() => Promise.resolve([]));
  const { rerender } = renderTree(makeProps({ fetchPath }));
  fireEvent.click(getToggle('About us'));
  fireEvent.click(getRootToggle());

  rerender(makeProps({ currentId: 7, fetchPath }));

  expect(getItem('Jane Doe').getAttribute('aria-current')).toBe('page');
  expect(fetchPath).not.toHaveBeenCalled();
});

test('TreeView reveals a current page that is not stored', async () => {
  const fetchPath = jest.fn((id) => Promise.resolve(getPath(id)));
  const props = makeProps({ currentId: 8, fetchPath });
  renderTree(props);
  const item = await screen.findByRole('treeitem', { name: 'Sam Smith' });

  expect(fetchPath.mock.calls).toEqual([[8]]);
  expect(props.fetchChildren.mock.calls).toEqual([[0], [2], [5]]);
  expect(item.getAttribute('aria-current')).toBe('page');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(item);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
});

test('TreeView does not reveal again for a new fetchPath', async () => {
  const fetchPath = jest.fn((id) => Promise.resolve(getPath(id)));
  const props = makeProps({ currentId: 8, fetchPath });
  const { rerender } = renderTree(props);
  await screen.findByRole('treeitem', { name: 'Sam Smith' });
  fireEvent.click(getToggle('About us'));

  const nextFetchPath = jest.fn((id) => Promise.resolve(getPath(id)));
  rerender({ ...props, fetchPath: nextFetchPath });
  await flush();

  expect(fetchPath).toHaveBeenCalledTimes(1);
  expect(nextFetchPath).not.toHaveBeenCalled();
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
});

test('TreeView repeats no request, reveal or reload when it is given new functions on every render', async () => {
  const requests = [];
  const paths = [];
  const withNewFunctions = (props) => ({
    ...props,
    fetchChildren: (parentId) => {
      requests.push(parentId);
      return Promise.resolve(getChildren(parentId));
    },
    fetchPath: (id) => {
      paths.push(id);
      return Promise.resolve(getPath(id));
    },
    onOpen: () => {},
    onShowAsList: () => {},
  });
  const props = makeProps({ currentId: 8, reloadKey: 1 });
  const { rerender, container } = renderTree(withNewFunctions(props));
  rerender(withNewFunctions(props));
  await screen.findByRole('treeitem', { name: 'Sam Smith' });
  fireEvent.click(getToggle('About us'));
  container.querySelector('nav').scrollTop = 40;

  rerender(withNewFunctions(props));
  rerender(withNewFunctions(props));
  await flush();

  expect(requests).toEqual([0, 2, 5]);
  expect(paths).toEqual([8]);
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('nav').scrollTop).toBe(40);
});

test('TreeView ignores the path of a current page that changed while it was fetched', async () => {
  const path = deferred();
  const fetchPath = jest.fn((id) => (id === 8 ? path.promise : Promise.resolve(getPath(id))));
  const props = makeProps({ currentId: 8, fetchPath });
  const { rerender } = renderTree(props);
  await flush();

  rerender({ ...props, currentId: 4 });
  await flush();
  path.resolve([2, 5]);
  await flush();

  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
  expect(props.fetchChildren.mock.calls).toEqual([[0]]);
  expect(getItem('Contact us Modified').getAttribute('aria-current')).toBe('page');
});

test('TreeView reloads a list on the path of the current page that misses the next page', async () => {
  saveTree({ openIds: [2] });
  const added = {
    2: [...getChildren(2), makePage(10, 2, 'Careers', { hasChildren: true })],
    10: [makePage(11, 10, 'Vacancies')],
  };
  const fetchChildren = jest.fn((parentId) => Promise.resolve(added[parentId] || getChildren(parentId)));
  const fetchPath = jest.fn(() => Promise.resolve([2, 10]));
  renderTree(makeProps({ currentId: 11, fetchChildren, fetchPath }));
  const item = await screen.findByRole('treeitem', { name: 'Vacancies' });

  expect(fetchChildren.mock.calls).toEqual([[2], [10]]);
  expect(getItem('Careers').getAttribute('aria-expanded')).toBe('true');
  expect(item.getAttribute('aria-current')).toBe('page');
});

const alpha = makePage(20, 0, 'Alpha', { hasChildren: true });
const beta = makePage(21, 0, 'Beta', { hasChildren: true });
const moved = makePage(22, 20, 'Moved');
const added = makePage(23, 20, 'Added');

// Saves Alpha open over Moved; the server has since moved it under Beta and added Added under Alpha
function saveMovedPageTree({ actions = [], revealedId = null } = {}) {
  seedTree([
    ...loadActions(0, [alpha, beta]),
    ...loadActions(20, [moved]),
    { type: 'expandNode', id: 20 },
    ...actions,
    ...(revealedId === null ? [] : [{ type: 'revealRequest', id: revealedId }]),
  ]);
}

test('TreeView asks for the path of a current page its stored parent no longer lists', async () => {
  saveMovedPageTree();
  const server = { 0: [alpha, beta], 20: [added], 21: [{ ...moved, parentId: 21 }] };
  const fetchChildren = jest.fn((parentId) => Promise.resolve(server[parentId]));
  const fetchPath = jest.fn((id) => Promise.resolve(id === 23 ? [20] : [21]));
  const props = makeProps({ currentId: 23, fetchChildren, fetchPath });
  const { rerender } = renderTree(props);
  expect((await screen.findByRole('treeitem', { name: 'Added' })).getAttribute('aria-current')).toBe('page');
  expect(queryItem('Moved')).toBeNull();

  rerender({ ...props, currentId: 22 });
  const item = await screen.findByRole('treeitem', { name: 'Moved' });

  expect(fetchPath.mock.calls).toEqual([[23], [22]]);
  expect(fetchChildren.mock.calls).toEqual([[20], [21]]);
  expect(getItem('Beta').getAttribute('aria-expanded')).toBe('true');
  expect(item.getAttribute('aria-current')).toBe('page');
});

test('TreeView does not treat a current page missing from its reloaded list as shown', async () => {
  saveMovedPageTree({ actions: loadActions(20, [added]), revealedId: 22 });
  const fetchChildren = jest.fn(() => Promise.resolve([{ ...moved, parentId: 21 }]));
  renderTree(makeProps({ currentId: 22, fetchChildren }));

  expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

  fireEvent.click(getToggle('Beta'));
  await flush();

  expect(getItem('Moved').getAttribute('aria-current')).toBe('page');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(getItem('Moved'));
});

test('TreeView scrolls the current row into view again when it returns after no page was current', () => {
  saveTree({ openIds: [2], revealedId: 6 });
  const { rerender } = renderTree(makeProps({ currentId: 6 }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

  rerender(makeProps({ currentId: null }));
  rerender(makeProps({ currentId: 6 }));

  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  expect(Element.prototype.scrollIntoView.mock.instances[1]).toBe(getItem('History Draft'));
});

test('TreeView scrolls the current row into view once per current page, not each time it is shown', () => {
  saveTree({ openIds: [2], revealedId: 6, actions: [{ type: 'collapseNode', id: 0 }] });
  const { rerender } = renderTree(makeProps({ currentId: 6 }));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

  fireEvent.click(getRootToggle());
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(getItem('History Draft'));

  fireEvent.click(getToggle('About us'));
  fireEvent.click(getToggle('About us'));
  fireEvent.click(getRootToggle());
  fireEvent.click(getRootToggle());
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

  rerender(makeProps({ currentId: 4 }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  expect(Element.prototype.scrollIntoView.mock.instances[1]).toBe(getItem('Contact us Modified'));
});

test('TreeView draws a remount from the saved state at once, as the user left it, with no request', async () => {
  const fetchPath = jest.fn((id) => Promise.resolve(getPath(id)));
  const props = makeProps({ currentId: 7, fetchPath });
  const first = renderTree(props);
  expect((await screen.findByRole('treeitem', { name: 'Jane Doe' })).getAttribute('aria-current')).toBe('page');
  fireEvent.click(getToggle('Our team'));
  fireEvent.click(getRootToggle());
  first.unmount();
  Element.prototype.scrollIntoView.mockClear();

  const second = makeProps({ currentId: '7', fetchPath: jest.fn(() => Promise.resolve([])) });
  renderTree(second);

  expect(screen.queryAllByRole('treeitem')).toEqual([]);
  fireEvent.click(getRootToggle());
  expect(screen.getAllByRole('treeitem')).toHaveLength(6);
  expect(getItem('Our team').getAttribute('aria-expanded')).toBe('false');
  await flush();
  expect(second.fetchPath).not.toHaveBeenCalled();
  expect(second.fetchChildren).not.toHaveBeenCalled();
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

test('TreeView keeps the scroll offset across a remount, then brings the current row into view', () => {
  saveTree({ openIds: [2], revealedId: 6 });
  const first = renderTree(makeProps({ currentId: 6 }));
  first.container.querySelector('nav').scrollTop = 120;
  first.unmount();

  let offsetWhenScrolled = null;
  Element.prototype.scrollIntoView = jest.fn(function scrollIntoView() {
    offsetWhenScrolled = this.closest('nav').scrollTop;
  });
  const { container } = renderTree(makeProps({ currentId: 6 }));

  expect(container.querySelector('nav').scrollTop).toBe(120);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(getItem('History Draft'));
  expect(offsetWhenScrolled).toBe(120);
});

test('TreeView keeps the saved scroll offset when the tree is out of the document at unmount', () => {
  saveTree({ actions: [{ type: 'setScroll', scrollTop: 120 }] });
  const first = renderTree(makeProps());
  const nav = first.container.querySelector('nav');
  expect(nav.scrollTop).toBe(120);
  first.container.remove();
  // What a browser reads from a detached element
  nav.scrollTop = 0;
  first.unmount();

  const { container } = renderTree(makeProps());
  expect(container.querySelector('nav').scrollTop).toBe(120);
});

test('TreeView keeps a load and a reveal in flight across a remount, and applies a response that arrives unmounted', async () => {
  const top = deferred();
  const path = deferred();
  const props = makeProps({
    currentId: 8,
    fetchChildren: jest.fn((parentId) => (parentId === 0 ? top.promise : Promise.resolve(getChildren(parentId)))),
    fetchPath: jest.fn(() => path.promise),
  });
  renderTree(props).unmount();
  const second = renderTree(props);
  expect(props.fetchChildren.mock.calls).toEqual([[0]]);
  expect(props.fetchPath).toHaveBeenCalledTimes(1);
  second.unmount();

  top.resolve(getChildren(0));
  path.resolve([2, 5]);
  await flush();
  renderTree(props);
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('true');
  const item = await screen.findByRole('treeitem', { name: 'Sam Smith' });

  expect(props.fetchChildren.mock.calls).toEqual([[0], [2], [5]]);
  expect(props.fetchPath).toHaveBeenCalledTimes(1);
  expect(item.getAttribute('aria-current')).toBe('page');
});

test('TreeView keeps two trees with different ids apart', async () => {
  const pages = makeProps();
  const files = makeProps({
    treeId: 'files',
    label: 'Files',
    rootTitle: 'Files',
    fetchChildren: jest.fn(() => Promise.resolve([makePage(2, 0, 'Uploads', { hasChildren: true })])),
  });
  render(<><TreeView {...pages} /><TreeView {...files} /></>);
  await flush();

  const filesNav = screen.getByRole('navigation', { name: 'Files' });
  fireEvent.click(getToggle('About us'));
  fireEvent.click(filesNav.querySelector('.tree-view__root > .tree-view__toggle'));
  await flush();

  expect(pages.fetchChildren.mock.calls).toEqual([[0], [2]]);
  expect(files.fetchChildren.mock.calls).toEqual([[0]]);
  expect(within(screen.getByRole('navigation', { name: 'Site pages' })).getAllByRole('treeitem')).toHaveLength(6);
  expect(within(filesNav).queryAllByRole('treeitem')).toEqual([]);
});

test('TreeView makes one request per parent under StrictMode, and none on a remount', async () => {
  const props = makeProps({ currentId: 8, fetchPath: jest.fn((id) => Promise.resolve(getPath(id))) });
  const first = render(<React.StrictMode><TreeView {...props} /></React.StrictMode>);
  const item = await screen.findByRole('treeitem', { name: 'Sam Smith' });

  expect(props.fetchChildren.mock.calls).toEqual([[0], [2], [5]]);
  expect(props.fetchPath).toHaveBeenCalledTimes(1);
  expect(item.getAttribute('aria-current')).toBe('page');
  first.unmount();

  const second = makeProps({ currentId: 8, fetchPath: jest.fn(() => Promise.resolve([])) });
  render(<React.StrictMode><TreeView {...second} /></React.StrictMode>);
  await flush();

  expect(second.fetchChildren).not.toHaveBeenCalled();
  expect(second.fetchPath).not.toHaveBeenCalled();
  expect(getItem('Sam Smith')).not.toBeNull();
});

test('TreeView asks once for a list that fails at once under StrictMode', () => {
  const fetchChildren = jest.fn(() => {
    throw new Error('Server error');
  });
  render(<React.StrictMode><TreeView {...makeProps({ fetchChildren })} /></React.StrictMode>);

  expect(fetchChildren).toHaveBeenCalledTimes(1);
});

test('A tree store stops calling a listener that has unsubscribed', () => {
  const store = getTreeStore(TREE);
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);

  store.dispatch({ type: 'expandNode', id: 2 });
  unsubscribe();
  store.dispatch({ type: 'collapseNode', id: 2 });

  expect(listener).toHaveBeenCalledTimes(1);
});

// Answers each request with a deferred response, resolved by parent id in the order asked
function deferredServer() {
  const pending = [];
  const fetchChildren = jest.fn((parentId) => {
    const response = deferred();
    pending.push({ parentId, response });
    return response.promise;
  });
  const respond = (parentId, value) => {
    const index = pending.findIndex((request) => request.parentId === parentId);
    const [{ response }] = pending.splice(index, 1);
    response.resolve(value);
  };
  return { fetchChildren, respond };
}

test('TreeView reloads the top level and each expanded parent with the rows kept, and drops lists not open', async () => {
  saveTree({ openIds: [2, 5], revealedId: 6, actions: [{ type: 'collapseNode', id: 5 }] });
  const { fetchChildren, respond } = deferredServer();
  const fetchPath = jest.fn(() => Promise.resolve([2]));
  const props = makeProps({ currentId: 6, fetchChildren, fetchPath });
  const { rerender, container } = renderTree(props);
  expect(fetchChildren).not.toHaveBeenCalled();

  rerender({ ...props, reloadKey: 1 });

  expect(fetchChildren.mock.calls).toEqual([[0], [2]]);
  expect(screen.getAllByRole('treeitem')).toHaveLength(6);
  expect(container.querySelector('.tree-view__item--loading')).toBeNull();
  expect(screen.getByRole('tree').hasAttribute('aria-busy')).toBe(false);
  expect(getItem('About us').hasAttribute('aria-busy')).toBe(false);

  respond(0, [
    getNode(2),
    getNode(3),
    { ...getNode(4), treeTitle: 'Contact', classes: 'class-Page', statusFlags: [] },
    makePage(11, 0, 'Events'),
  ]);
  await flush();
  expect(queryItem('Home')).toBeNull();
  expect(getItem('Contact')).not.toBeNull();
  expect(getItem('Events')).not.toBeNull();
  expect(getItem('History Draft')).not.toBeNull();

  respond(2, [getNode(5), { ...getNode(6), treeTitle: 'Our history', statusFlags: [] }]);
  await flush();
  expect(getItem('Our history').getAttribute('aria-current')).toBe('page');
  expect(fetchPath).not.toHaveBeenCalled();

  fireEvent.click(getToggle('Our team'));
  expect(fetchChildren.mock.calls).toEqual([[0], [2], [5]]);
  expect(screen.getByRole('group', { name: 'Our team' }).textContent).toBe('Loading...');
});

test('TreeView reloads on a mount after the value changed while unmounted, and not for the same value', async () => {
  const props = makeProps({ reloadKey: 1 });
  const first = renderTree(props);
  await flush();
  expect(props.fetchChildren.mock.calls).toEqual([[0]]);
  first.unmount();

  const same = makeProps({ reloadKey: 1 });
  const second = renderTree(same);
  await flush();
  expect(same.fetchChildren).not.toHaveBeenCalled();
  second.unmount();

  const changed = makeProps({ reloadKey: 2 });
  renderTree(changed);
  expect(screen.getAllByRole('treeitem')).toHaveLength(4);
  await flush();
  expect(changed.fetchChildren.mock.calls).toEqual([[0]]);
});

test('TreeView keeps the old rows and shows no failed row when a reload fails, and tries again on the next', async () => {
  saveTree({ openIds: [2] });
  const fetchChildren = jest.fn((parentId) => (
    parentId === 2 ? Promise.reject(new Error('Server error')) : Promise.resolve(getChildren(parentId))
  ));
  const props = makeProps({ fetchChildren });
  const { rerender } = renderTree(props);

  rerender({ ...props, reloadKey: 1 });
  await flush();
  expect(getItem('Our team')).not.toBeNull();
  expect(queryItem('Failed to load Try again')).toBeNull();

  rerender({ ...props, reloadKey: 2 });
  await flush();
  expect(fetchChildren.mock.calls).toEqual([[0], [2], [0], [2]]);
  expect(getItem('Our team')).not.toBeNull();
});

test('TreeView stops reloading the lists of a page that has left the tree', async () => {
  saveTree({ openIds: [2, 5], actions: [...loadActions(7, [makePage(40, 7, 'Notes')]), { type: 'expandNode', id: 7 }] });
  const fetchChildren = jest.fn((parentId) => Promise.resolve(parentId === 2 ? [getNode(6)] : getChildren(parentId)));
  const props = makeProps({ fetchChildren });
  const { rerender } = renderTree(props);

  rerender({ ...props, reloadKey: 1 });
  await flush();
  expect(fetchChildren.mock.calls).toEqual([[0], [2], [5], [7]]);
  expect(queryItem('Our team')).toBeNull();

  rerender({ ...props, reloadKey: 2 });
  await flush();
  expect(fetchChildren.mock.calls.slice(4)).toEqual([[0], [2]]);
});

test('TreeView leaves a parent the user collapses during a reload closed', async () => {
  saveTree({ openIds: [2], revealedId: 6 });
  const { fetchChildren, respond } = deferredServer();
  const fetchPath = jest.fn(() => Promise.resolve([2]));
  const props = makeProps({ currentId: 6, fetchChildren, fetchPath });
  const { rerender } = renderTree(props);
  expect(getItem('History Draft').getAttribute('aria-current')).toBe('page');

  rerender({ ...props, reloadKey: 1 });
  fireEvent.click(getToggle('About us'));
  respond(0, getChildren(0));
  respond(2, getChildren(2));
  await flush();

  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
  expect(fetchPath).not.toHaveBeenCalled();
});

test('TreeView reveals the current page under its new parent after a reload', async () => {
  saveMovedPageTree({ revealedId: 22 });
  const server = { 0: [alpha, beta], 20: [added], 21: [{ ...moved, parentId: 21 }] };
  const fetchChildren = jest.fn((parentId) => Promise.resolve(server[parentId]));
  const fetchPath = jest.fn(() => Promise.resolve([21]));
  const props = makeProps({ currentId: 22, fetchChildren, fetchPath });
  const { rerender } = renderTree(props);
  expect(getItem('Moved').getAttribute('aria-current')).toBe('page');

  rerender({ ...props, reloadKey: 1 });
  const item = await within(await screen.findByRole('group', { name: 'Beta' })).findByRole('treeitem', { name: 'Moved' });

  expect(fetchChildren.mock.calls).toEqual([[0], [20], [21]]);
  expect(fetchPath.mock.calls).toEqual([[22]]);
  expect(within(screen.getByRole('group', { name: 'Alpha' })).queryByRole('treeitem', { name: 'Moved' })).toBeNull();
  expect(getItem('Beta').getAttribute('aria-expanded')).toBe('true');
  expect(item.getAttribute('aria-current')).toBe('page');
});

test('TreeView leaves a collapsed ancestor and a collapsed root closed after a reload when the current page stays', async () => {
  saveTree({
    openIds: [2, 5],
    revealedId: 7,
    actions: [{ type: 'collapseNode', id: 2 }, { type: 'collapseNode', id: 0 }],
  });
  const server = { 0: getChildren(0), 2: getChildren(2), 5: [{ ...getNode(7), treeTitle: 'Jane Smith' }] };
  const fetchChildren = jest.fn((parentId) => Promise.resolve(server[parentId]));
  const fetchPath = jest.fn(() => Promise.resolve([2, 5]));
  const props = makeProps({ currentId: 7, fetchChildren, fetchPath });
  const { rerender } = renderTree(props);

  rerender({ ...props, reloadKey: 1 });
  await flush();

  expect(fetchChildren.mock.calls).toEqual([[0]]);
  expect(fetchPath).not.toHaveBeenCalled();
  expect(screen.queryByRole('tree')).toBeNull();

  fireEvent.click(getRootToggle());
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(getToggle('About us'));
  const item = await screen.findByRole('treeitem', { name: 'Jane Smith' });
  expect(fetchChildren.mock.calls).toEqual([[0], [2], [5]]);
  expect(item.getAttribute('aria-current')).toBe('page');
});

test('TreeView shows no current row and no failed row after a reload drops an archived current page', async () => {
  saveTree({ openIds: [2], revealedId: 6 });
  const fetchChildren = jest.fn((parentId) => Promise.resolve(parentId === 2 ? [getNode(5)] : getChildren(parentId)));
  const fetchPath = jest.fn(() => Promise.reject(new Error('Not Found')));
  const props = makeProps({ currentId: 6, fetchChildren, fetchPath });
  const { rerender } = renderTree(props);
  expect(getItem('History Draft').getAttribute('aria-current')).toBe('page');

  rerender({ ...props, reloadKey: 1 });
  await waitFor(() => expect(fetchPath.mock.calls).toEqual([[6]]));

  expect(queryItem('History Draft')).toBeNull();
  expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  expect(queryItem('Failed to load Try again')).toBeNull();
  expect(getItem('About us').getAttribute('aria-expanded')).toBe('true');
});
