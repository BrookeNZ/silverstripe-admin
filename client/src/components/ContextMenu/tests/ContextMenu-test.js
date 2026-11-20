/* global jest, test, expect, afterEach */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ContextMenu from '../ContextMenu';

const TREE_ITEM = { id: 6, treeTitle: 'About Us' };

function makeItems() {
  return [
    { id: 'edit', label: 'Edit', onSelect: jest.fn() },
    { id: 'duplicate', label: 'Duplicate', onSelect: jest.fn() },
    { id: 'archive', label: 'Archive', onSelect: jest.fn(), disabled: true },
    { id: 'add', label: 'Add page here', onSelect: jest.fn() },
  ];
}

function makeProps(overrides = {}) {
  return {
    items: makeItems(),
    anchor: { x: 10, y: 20 },
    onClose: jest.fn(),
    label: 'About Us',
    subject: TREE_ITEM,
    ...overrides,
  };
}

function getItem(name) {
  return screen.getByRole('menuitem', { name });
}

const restores = [];

function stubProperty(target, name, descriptor) {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  restores.push(() => (original ? Object.defineProperty(target, name, original) : delete target[name]));
}

// Give the viewport and the menu a size. jsdom leaves each size at zero. The test can then read the position.
function stubLayout(viewport, size) {
  stubProperty(document.documentElement, 'clientWidth', { get: () => viewport.width });
  stubProperty(document.documentElement, 'clientHeight', { get: () => viewport.height });
  const isMenu = (element) => element.classList.contains('context-menu');
  stubProperty(HTMLElement.prototype, 'offsetWidth', { get() { return isMenu(this) ? size.width : 0; } });
  stubProperty(HTMLElement.prototype, 'offsetHeight', { get() { return isMenu(this) ? size.height : 0; } });
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
    const { width, height } = isMenu(this) ? size : { width: 0, height: 0 };
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
  });
}

function readPosition(menu) {
  const [, left, top] = menu.style.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/).map(Number);
  return { left, top };
}

// Hold animation frames back until the returned function runs the frames.
function holdFrames() {
  const frames = new Map();
  let lastId = 0;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    lastId += 1;
    frames.set(lastId, callback);
    return lastId;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
  return () => act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

function appendOutside() {
  const outside = document.createElement('div');
  document.body.appendChild(outside);
  restores.push(() => outside.remove());
  return outside;
}

afterEach(() => {
  restores.splice(0).reverse().forEach((restore) => restore());
  jest.restoreAllMocks();
});

test('ContextMenu renders a menu named by its label on the body, with one item per entry', () => {
  const { container } = render(<ContextMenu {...makeProps()} />);

  const menu = screen.getByRole('menu', { name: 'About Us' });
  expect(container.contains(menu)).toBe(false);
  expect(menu.parentNode).toBe(document.body);
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent))
    .toEqual(['Edit', 'Duplicate', 'Archive', 'Add page here']);
  screen.getAllByRole('menuitem').forEach((item) => expect(item.getAttribute('tabindex')).toBe('-1'));
});

test('ContextMenu focuses the first enabled item when it opens', () => {
  const [edit, duplicate, archive] = makeItems();
  render(<ContextMenu {...makeProps({ items: [{ ...archive }, edit, duplicate] })} />);

  expect(document.activeElement).toBe(getItem('Edit'));
});

test('ContextMenu moves focus and wraps with Down and Up, goes to the ends with Home and End, and moves focus on hover', () => {
  render(<ContextMenu {...makeProps()} />);
  const press = (key) => fireEvent.keyDown(document.activeElement, { key });

  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('Duplicate'));
  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('Archive'));
  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('Add page here'));
  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('Edit'));
  press('ArrowUp');
  expect(document.activeElement).toBe(getItem('Add page here'));
  press('Home');
  expect(document.activeElement).toBe(getItem('Edit'));
  press('End');
  expect(document.activeElement).toBe(getItem('Add page here'));

  fireEvent.mouseEnter(getItem('Duplicate'));
  expect(document.activeElement).toBe(getItem('Duplicate'));
});

test('ContextMenu lets a disabled item take focus but activates nothing', () => {
  const props = makeProps();
  render(<ContextMenu {...props} />);
  const archive = getItem('Archive');

  fireEvent.keyDown(getItem('Edit'), { key: 'ArrowDown' });
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(archive);
  expect(archive.getAttribute('aria-disabled')).toBe('true');

  fireEvent.keyDown(archive, { key: 'Enter' });
  fireEvent.keyDown(archive, { key: ' ' });
  fireEvent.click(archive);
  expect(props.items[2].onSelect).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu calls the item once with the subject on Enter and Space, then closes', () => {
  const calls = [];
  const items = makeItems().map((item) => ({ ...item, onSelect: jest.fn(() => calls.push(`select ${item.id}`)) }));
  const onClose = jest.fn((reason) => calls.push(`close ${reason}`));
  render(<ContextMenu {...makeProps({ items, onClose })} />);

  expect(fireEvent.keyDown(getItem('Edit'), { key: 'Enter' })).toBe(false);
  expect(items[0].onSelect).toHaveBeenCalledTimes(1);
  expect(items[0].onSelect).toHaveBeenCalledWith(TREE_ITEM, expect.objectContaining({ key: 'Enter' }));

  expect(fireEvent.keyDown(getItem('Duplicate'), { key: ' ' })).toBe(false);
  expect(items[1].onSelect).toHaveBeenCalledTimes(1);
  expect(items[1].onSelect).toHaveBeenCalledWith(TREE_ITEM, expect.objectContaining({ key: ' ' }));

  expect(calls).toEqual(['select edit', 'close select', 'select duplicate', 'close select']);
});

test('ContextMenu closes on Escape, and closes on Tab and Shift+Tab in place of moving focus', () => {
  const props = makeProps();
  render(<ContextMenu {...props} />);

  expect(fireEvent.keyDown(getItem('Edit'), { key: 'Escape' })).toBe(false);
  expect(props.onClose).toHaveBeenLastCalledWith('escape');

  expect(fireEvent.keyDown(getItem('Edit'), { key: 'Tab' })).toBe(false);
  expect(props.onClose).toHaveBeenLastCalledWith('tab');

  expect(fireEvent.keyDown(getItem('Edit'), { key: 'Tab', shiftKey: true })).toBe(false);
  expect(props.onClose).toHaveBeenLastCalledWith('tab');
  expect(props.onClose).toHaveBeenCalledTimes(3);
});

test('ContextMenu closes on a press outside and not inside, and dismisses on a scroll, a resize or the window blur', () => {
  const props = makeProps();
  const outside = appendOutside();
  const runFrames = holdFrames();
  render(<ContextMenu {...props} />);
  runFrames();

  fireEvent.pointerDown(getItem('Duplicate'));
  fireEvent.scroll(screen.getByRole('menu'));
  fireEvent.blur(getItem('Edit'));
  expect(props.onClose).not.toHaveBeenCalled();

  fireEvent.pointerDown(outside);
  expect(props.onClose).toHaveBeenLastCalledWith('outside');

  fireEvent.scroll(outside);
  expect(props.onClose).toHaveBeenLastCalledWith('dismiss');
  fireEvent(window, new Event('resize'));
  fireEvent(window, new Event('blur'));
  expect(props.onClose.mock.calls).toEqual([['outside'], ['dismiss'], ['dismiss'], ['dismiss']]);
});

test('ContextMenu ignores a scroll that arrives before its first frame and closes on one after', () => {
  const props = makeProps();
  const outside = appendOutside();
  const runFrames = holdFrames();
  render(<ContextMenu {...props} />);

  fireEvent.scroll(outside);
  expect(props.onClose).not.toHaveBeenCalled();

  runFrames();
  fireEvent.scroll(outside);
  expect(props.onClose.mock.calls).toEqual([['dismiss']]);
});

test('ContextMenu cancels its first frame when unmounted before it and never listens for a scroll', () => {
  const props = makeProps();
  const runFrames = holdFrames();
  const added = jest.spyOn(document, 'addEventListener');
  const { unmount } = render(<ContextMenu {...props} />);

  unmount();
  runFrames();
  fireEvent.scroll(document);

  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(window.requestAnimationFrame.mock.results[0].value);
  expect(added.mock.calls.filter(([type]) => type === 'scroll')).toEqual([]);
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu takes focus itself when it has no items', () => {
  render(<ContextMenu {...makeProps({ items: [] })} />);

  expect(document.activeElement).toBe(screen.getByRole('menu'));
});

test('ContextMenu leaves a key with Ctrl, Alt or Meta held to the browser', () => {
  const props = makeProps();
  render(<ContextMenu {...props} />);
  const edit = getItem('Edit');

  ['ctrlKey', 'altKey', 'metaKey'].forEach((modifier) => {
    expect(fireEvent.keyDown(edit, { key: 'ArrowDown', [modifier]: true })).toBe(true);
    expect(fireEvent.keyDown(edit, { key: 'd', [modifier]: true })).toBe(true);
  });
  expect(document.activeElement).toBe(edit);
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu keeps its keys and a right-click from a React ancestor, and prevents the browser menu', () => {
  const onKeyDown = jest.fn();
  const onContextMenu = jest.fn();
  render(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown} onContextMenu={onContextMenu}>
      <ContextMenu {...makeProps()} />
    </div>
  );

  ['ArrowDown', 'Home', 'd', 'Enter', 'Escape', 'Tab'].forEach((key) => {
    fireEvent.keyDown(getItem('Edit'), { key });
  });
  expect(onKeyDown).not.toHaveBeenCalled();

  expect(fireEvent.contextMenu(getItem('Edit'))).toBe(false);
  expect(onContextMenu).not.toHaveBeenCalled();
});

test('ContextMenu moves focus on a first letter to the next item starting with it, wrapping', () => {
  const items = [
    { id: 'edit', label: 'Edit' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'archive', label: 'Archive', disabled: true },
    { id: 'delete', label: 'Delete' },
  ];
  render(<ContextMenu {...makeProps({ items })} />);
  const press = (key) => fireEvent.keyDown(document.activeElement, { key });

  press('d');
  expect(document.activeElement).toBe(getItem('Duplicate'));
  press('D');
  expect(document.activeElement).toBe(getItem('Delete'));
  press('d');
  expect(document.activeElement).toBe(getItem('Duplicate'));
  press('a');
  expect(document.activeElement).toBe(getItem('Archive'));
  press('z');
  expect(document.activeElement).toBe(getItem('Archive'));
});

function makeNestedItems() {
  return [
    { id: 'edit', label: 'Edit', onSelect: jest.fn() },
    {
      id: 'duplicate',
      label: 'Duplicate',
      onSelect: jest.fn(),
      items: [
        { id: 'this', label: 'This page only', onSelect: jest.fn() },
        { id: 'all', label: 'This page and subpages', onSelect: jest.fn() },
      ],
    },
    { id: 'archive', label: 'Archive', onSelect: jest.fn() },
  ];
}

test('ContextMenu marks a submenu parent as having a menu and whether it is expanded; other items say neither', () => {
  render(<ContextMenu {...makeProps({ items: makeNestedItems() })} />);
  const duplicate = getItem('Duplicate');

  expect(duplicate.getAttribute('aria-haspopup')).toBe('menu');
  expect(duplicate.getAttribute('aria-expanded')).toBe('false');
  expect(getItem('Edit').hasAttribute('aria-haspopup')).toBe(false);
  expect(getItem('Edit').hasAttribute('aria-expanded')).toBe(false);
  expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();

  fireEvent.keyDown(duplicate, { key: 'ArrowRight' });
  expect(duplicate.getAttribute('aria-expanded')).toBe('true');
  const submenu = screen.getByRole('menu', { name: 'Duplicate' });
  expect(submenu.previousElementSibling).toBe(duplicate);
  expect(screen.getByRole('menu', { name: 'About Us' }).contains(submenu)).toBe(true);
});

test('ContextMenu opens a submenu on its first item with Right, Enter, Space and a click, without closing the menu', () => {
  const props = makeProps({ items: makeNestedItems() });
  render(<ContextMenu {...props} />);
  const openers = [
    (item) => fireEvent.keyDown(item, { key: 'ArrowRight' }),
    (item) => fireEvent.keyDown(item, { key: 'Enter' }),
    (item) => fireEvent.keyDown(item, { key: ' ' }),
    (item) => fireEvent.click(item),
  ];

  openers.forEach((open) => {
    open(getItem('Duplicate'));
    expect(document.activeElement).toBe(getItem('This page only'));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();
  });
  expect(props.items[1].onSelect).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu closes only the submenu and focuses its parent on Left and Escape; Left at the top does nothing', () => {
  const props = makeProps({ items: makeNestedItems() });
  render(<ContextMenu {...props} />);

  ['ArrowLeft', 'Escape'].forEach((key) => {
    fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowRight' });
    expect(fireEvent.keyDown(getItem('This page only'), { key })).toBe(false);
    expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();
    expect(document.activeElement).toBe(getItem('Duplicate'));
  });
  expect(props.onClose).not.toHaveBeenCalled();

  expect(fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowLeft' })).toBe(false);
  expect(fireEvent.keyDown(getItem('Edit'), { key: 'ArrowRight' })).toBe(false);
  expect(document.activeElement).toBe(getItem('Duplicate'));
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu moves among the items of a submenu with keys, and choosing one closes every level', () => {
  const props = makeProps({ items: makeNestedItems() });
  render(<ContextMenu {...props} />);
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowRight' });
  const press = (key) => fireEvent.keyDown(document.activeElement, { key });

  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('This page and subpages'));
  press('ArrowDown');
  expect(document.activeElement).toBe(getItem('This page only'));
  press('End');
  expect(document.activeElement).toBe(getItem('This page and subpages'));
  press('a');
  expect(document.activeElement).toBe(getItem('This page and subpages'));
  press('t');
  expect(document.activeElement).toBe(getItem('This page only'));

  press('Enter');
  expect(props.items[1].items[0].onSelect).toHaveBeenCalledWith(TREE_ITEM, expect.objectContaining({ key: 'Enter' }));
  expect(props.onClose.mock.calls).toEqual([['select']]);
});

test('ContextMenu opens a submenu on hover and keeps focus on its parent; another top-level item closes it, by hover or by key', () => {
  render(<ContextMenu {...makeProps({ items: makeNestedItems() })} />);

  fireEvent.mouseEnter(getItem('Duplicate'));
  expect(screen.getByRole('menu', { name: 'Duplicate' })).toBeTruthy();
  expect(document.activeElement).toBe(getItem('Duplicate'));

  fireEvent.mouseEnter(getItem('This page and subpages'));
  expect(document.activeElement).toBe(getItem('This page and subpages'));
  expect(screen.getByRole('menu', { name: 'Duplicate' })).toBeTruthy();

  fireEvent.mouseEnter(getItem('Archive'));
  expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();

  fireEvent.mouseEnter(getItem('Duplicate'));
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowDown' });
  expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();
  expect(document.activeElement).toBe(getItem('Archive'));
});

test('ContextMenu closes every level on Tab in a submenu', () => {
  const props = makeProps({ items: makeNestedItems() });
  render(<ContextMenu {...props} />);
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowRight' });

  expect(fireEvent.keyDown(getItem('This page only'), { key: 'Tab' })).toBe(false);
  expect(props.onClose.mock.calls).toEqual([['tab']]);
});

test('ContextMenu prevents a held Enter or Space but chooses nothing', () => {
  const props = makeProps({ items: makeNestedItems() });
  render(<ContextMenu {...props} />);
  fireEvent.keyDown(getItem('Duplicate'), { key: 'Enter' });

  expect(fireEvent.keyDown(document.activeElement, { key: 'Enter', repeat: true })).toBe(false);
  expect(fireEvent.keyDown(document.activeElement, { key: ' ', repeat: true })).toBe(false);
  expect(props.items[1].items[0].onSelect).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu chooses an item inside a submenu even when it carries items of its own', () => {
  const items = makeNestedItems();
  items[1].items[0].items = [{ id: 'deeper', label: 'Deeper' }];
  const props = makeProps({ items });
  render(<ContextMenu {...props} />);
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowRight' });

  expect(getItem('This page only').hasAttribute('aria-haspopup')).toBe(false);
  fireEvent.click(getItem('This page only'));
  expect(items[1].items[0].onSelect).toHaveBeenCalledTimes(1);
  expect(props.onClose.mock.calls).toEqual([['select']]);
});

test('ContextMenu opens nothing from a disabled submenu parent', () => {
  const items = makeNestedItems();
  items[1].disabled = true;
  render(<ContextMenu {...makeProps({ items })} />);
  const duplicate = getItem('Duplicate');

  fireEvent.mouseEnter(duplicate);
  fireEvent.keyDown(duplicate, { key: 'ArrowRight' });
  fireEvent.keyDown(duplicate, { key: 'Enter' });
  fireEvent.click(duplicate);
  expect(screen.queryByRole('menu', { name: 'Duplicate' })).toBeNull();
  expect(duplicate.getAttribute('aria-expanded')).toBe('false');
});

test('ContextMenu stays open on a press or a scroll inside an open submenu', () => {
  const props = makeProps({ items: makeNestedItems() });
  const runFrames = holdFrames();
  render(<ContextMenu {...props} />);
  runFrames();
  fireEvent.keyDown(getItem('Duplicate'), { key: 'ArrowRight' });

  fireEvent.pointerDown(getItem('This page only'));
  fireEvent.scroll(screen.getByRole('menu', { name: 'Duplicate' }));
  expect(props.onClose).not.toHaveBeenCalled();
});

test('ContextMenu stays inside the viewport when placed at a point near the right and bottom edges', async () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 100 };
  stubLayout(viewport, size);

  render(<ContextMenu {...makeProps({ anchor: { x: 950, y: 750 } })} />);
  await act(() => Promise.resolve());

  const menu = screen.getByRole('menu');
  const { left, top } = readPosition(menu);
  expect(menu.style.position).toBe('fixed');
  expect(left).toBeGreaterThanOrEqual(0);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(left + size.width).toBeLessThanOrEqual(viewport.width);
  expect(top + size.height).toBeLessThanOrEqual(viewport.height);
});

test('ContextMenu moves when its anchor changes', async () => {
  stubLayout({ width: 1000, height: 800 }, { width: 200, height: 100 });
  const props = makeProps({ anchor: { x: 10, y: 20 } });
  const { rerender } = render(<ContextMenu {...props} />);
  await act(() => Promise.resolve());
  expect(readPosition(screen.getByRole('menu'))).toEqual({ left: 10, top: 20 });

  rerender(<ContextMenu {...props} anchor={{ x: 300, y: 400 }} />);
  await act(() => Promise.resolve());
  expect(readPosition(screen.getByRole('menu'))).toEqual({ left: 300, top: 400 });
});

test('ContextMenu removes the menu and every listener it added when unmounted', () => {
  const targets = [document, window];
  const added = targets.map((target) => jest.spyOn(target, 'addEventListener'));
  const removed = targets.map((target) => jest.spyOn(target, 'removeEventListener'));
  const runFrames = holdFrames();
  const { unmount } = render(<ContextMenu {...makeProps()} />);
  runFrames();
  const menu = screen.getByRole('menu');

  unmount();

  expect(menu.isConnected).toBe(false);
  expect(document.querySelector('.context-menu')).toBeNull();
  expect(added[0].mock.calls.map(([type]) => type)).toContain('scroll');
  targets.forEach((target, index) => {
    // React adds a `selectionchange` listener to the document once and keeps that listener.
    const calls = added[index].mock.calls.filter(([type]) => type !== 'selectionchange');
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach((args) => expect(removed[index]).toHaveBeenCalledWith(...args));
  });
});

function makeDeferred() {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => Object.assign(deferred, { resolve, reject }));
  return deferred;
}

function makeLazyItems(loadItems, fields = {}) {
  return [
    { id: 'edit', label: 'Edit', onSelect: jest.fn() },
    { id: 'add', label: 'Add page here', loadItems, ...fields },
  ];
}

function makeSubmenuItems(count) {
  return Array.from({ length: count }, (value, index) => ({
    id: `item-${index + 1}`,
    label: `Item ${index + 1}`,
    onSelect: jest.fn(),
  }));
}

// Run every promise callback that is waiting.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

test('ContextMenu loads the items of a submenu once when the menu mounts, and shows them in the submenu', async () => {
  const types = makeSubmenuItems(2);
  const loadItems = jest.fn(() => Promise.resolve(types));
  const props = makeProps({ items: makeLazyItems(loadItems) });
  render(<ContextMenu {...props} />);
  expect(loadItems).toHaveBeenCalledTimes(1);
  await settle();

  fireEvent.keyDown(getItem('Add page here'), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(getItem('Item 1'));
  fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
  fireEvent.keyDown(getItem('Add page here'), { key: 'ArrowRight' });
  fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
  fireEvent.keyDown(document.activeElement, { key: 'Enter' });

  expect(loadItems).toHaveBeenCalledTimes(1);
  expect(types[1].onSelect).toHaveBeenCalledWith(TREE_ITEM, expect.objectContaining({ key: 'Enter' }));
  expect(props.onClose.mock.calls).toEqual([['select']]);
});

test('ContextMenu shows a busy submenu with a disabled loading item, then moves focus from it to the first loaded item', async () => {
  const load = makeDeferred();
  render(<ContextMenu {...makeProps({ items: makeLazyItems(() => load.promise) })} />);
  fireEvent.keyDown(getItem('Add page here'), { key: 'ArrowRight' });

  const submenu = screen.getByRole('menu', { name: 'Add page here' });
  const loading = getItem('Loading...');
  expect(submenu.getAttribute('aria-busy')).toBe('true');
  expect(loading.getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(loading);

  load.resolve(makeSubmenuItems(2));
  await settle();
  expect(submenu.hasAttribute('aria-busy')).toBe(false);
  expect(document.activeElement).toBe(getItem('Item 1'));
});

test('ContextMenu leaves focus on the parent item when the items arrive in a submenu opened by hover', async () => {
  const load = makeDeferred();
  render(<ContextMenu {...makeProps({ items: makeLazyItems(() => load.promise) })} />);
  fireEvent.mouseEnter(getItem('Add page here'));

  load.resolve(makeSubmenuItems(2));
  await settle();
  expect(getItem('Item 1')).toBeTruthy();
  expect(document.activeElement).toBe(getItem('Add page here'));
});

test.each([
  ['a failed load', () => Promise.reject(new Error('Server error')), {}, 'Failed to load'],
  ['a value that is not a list', () => Promise.resolve({}), {}, 'Failed to load'],
  ['an empty list', () => Promise.resolve([]), { emptyLabel: 'No page types allowed' }, 'No page types allowed'],
  ['an empty list with no empty label', () => Promise.resolve([]), {}, 'No items'],
])('ContextMenu shows one disabled item in the submenu after %s', async (description, loadItems, fields, label) => {
  const props = makeProps({ items: makeLazyItems(loadItems, fields) });
  render(<ContextMenu {...props} />);
  fireEvent.keyDown(getItem('Add page here'), { key: 'ArrowRight' });
  await settle();

  const submenu = screen.getByRole('menu', { name: 'Add page here' });
  expect(Array.from(submenu.querySelectorAll('[role="menuitem"]'), (item) => item.textContent)).toEqual([label]);
  expect(document.activeElement).toBe(getItem(label));
  expect(getItem(label).getAttribute('aria-disabled')).toBe('true');
  fireEvent.keyDown(getItem(label), { key: 'Enter' });
  expect(props.onClose).not.toHaveBeenCalled();
});

test.each([
  ['one column', 10, []],
  ['two columns', 11, ['context-menu--two-columns']],
  ['two columns', 20, ['context-menu--two-columns']],
  ['three columns', 21, ['context-menu--three-columns']],
])('ContextMenu lays out a submenu in %s for %i items', (description, count, columnClasses) => {
  const items = [{ id: 'add', label: 'Add page here', items: makeSubmenuItems(count) }];
  render(<ContextMenu {...makeProps({ items })} />);
  fireEvent.keyDown(getItem('Add page here'), { key: 'ArrowRight' });

  const submenu = screen.getByRole('menu', { name: 'Add page here' });
  expect(Array.from(submenu.classList).filter((name) => name.includes('column'))).toEqual(columnClasses);
});
