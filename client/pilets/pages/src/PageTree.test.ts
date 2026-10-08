// @vitest-environment happy-dom
import { act } from 'react';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { ChildrenResponse, PageNode, TreeApi } from './api';
import type { MoveHints } from './move';
import { PageTree } from './PageTree';
import { TreeStore } from './treeStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const topLevelPage: PageNode = {
  id: 1,
  parentId: 0,
  title: 'Home',
  menuTitle: 'Home',
  urlSegment: 'home',
  className: 'Page',
  hasChildren: false,
  childCount: 0,
  statusFlags: [],
  canEdit: true,
  canDelete: true,
  sort: 1,
};

const rootChildren: ChildrenResponse = { items: [topLevelPage], pageInfo: { totalCount: 1, pageSize: 50, page: 1, hasMore: false } };

function loadedStore(): TreeStore {
  const store = new TreeStore({ children: vi.fn(), ancestors: vi.fn(), search: vi.fn() } as unknown as TreeApi);
  const answered = new Set<unknown>();
  store.subscribe(() =>
    store
      .getRequests()
      .filter((request) => !answered.has(request))
      .forEach((request) => {
        answered.add(request);
        queueMicrotask(() => store.receive(request, { data: rootChildren }));
      }),
  );
  return store;
}

describe('PageTree keyboard drag', () => {
  it('leaves drag mode when the hints that arrive refuse the page a keyboard drag began on', async () => {
    let answerHints: (hints: MoveHints) => void = () => undefined;
    const hints = new Promise<MoveHints>((resolve) => {
      answerHints = resolve;
    });
    const mover = { client: { hints: () => hints, move: vi.fn() }, notify: vi.fn() };
    const store = loadedStore();
    const container = document.createElement('div');
    // The virtualiser renders only the rows that fit its scroll element, which happy-dom gives no size
    Object.defineProperties(container, { offsetHeight: { value: 600 }, offsetWidth: { value: 300 } });
    container.getBoundingClientRect = () => ({ top: 0, left: 0, right: 300, bottom: 600, width: 300, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PageTree, { store, currentId: null, onSelect: () => undefined, mover } as never));
    });
    await act(async () => {
      store.children(0);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const row = () => container.querySelector<HTMLElement>('[role="treeitem"]');
    expect(row()).not.toBeNull();

    await act(async () => {
      row()!.focus();
      // The tree's hotkeys match the keys held down, so each key of Control+Shift+D goes down in turn
      for (const [key, code] of [['Control', 'ControlLeft'], ['Shift', 'ShiftLeft'], ['D', 'KeyD']]) {
        row()!.dispatchEvent(new KeyboardEvent('keydown', { key, code, ctrlKey: true, shiftKey: code !== 'ControlLeft', bubbles: true }));
      }
    });
    expect(row()!.classList.contains('pages-tree__item--dragged')).toBe(true);

    await act(async () => {
      answerHints({ canOrganise: true, canCreateTopLevel: false, rootClasses: ['Page'], allowedChildren: {} });
      await hints;
    });
    expect(row()!.classList.contains('pages-tree__item--dragged')).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
