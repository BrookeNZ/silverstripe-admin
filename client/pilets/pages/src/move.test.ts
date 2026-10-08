// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { ChildrenResponse, PageNode, TreeApi } from './api';
import { canDragPage, canDropPage, createMoveApi, movePage } from './move';
import type { MoveApi, MoveHints } from './move';
import { PageTree } from './PageTree';
import { TreeStore } from './treeStore';
import type { ChildPageRequest } from './treeStore';

// The patterns package resolves its own React copy under vitest, so its components fail here
vi.mock('@silverstripe/admin-patterns', () => ({
  CollapsedIcon: () => null,
  ExpandedIcon: () => null,
  PageTypeIcon: () => null,
  ReorderIcon: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = 'SilverStripe\\CMS\\Model\\SiteTree';
const leaf = 'App\\LeafPage';

const hints: MoveHints = {
  canOrganise: true,
  canCreateTopLevel: true,
  rootClasses: [page],
  allowedChildren: { [page]: [page], [leaf]: [] },
};

// Top level: Alpha, Bravo, Charlie; Bravo holds Bravo 1
const parents: Record<number, number> = { 1: 0, 2: 0, 3: 0, 21: 2 };
const titles: Record<number, string> = { 1: 'Alpha', 2: 'Bravo', 3: 'Charlie', 21: 'Bravo 1' };

function node(id: number, overrides: Partial<PageNode> = {}): PageNode {
  const childCount = Object.values(parents).filter((parent) => parent === id).length;
  return {
    id,
    parentId: parents[id],
    title: titles[id],
    menuTitle: titles[id],
    urlSegment: titles[id].toLowerCase(),
    className: page,
    hasChildren: childCount > 0,
    childCount,
    statusFlags: [],
    canEdit: true,
    canDelete: true,
    sort: id,
    ...overrides,
  };
}

function fakeApi(): TreeApi {
  return {
    children: vi.fn(async (parentId: number, pageNumber: number, limit: number): Promise<ChildrenResponse> => {
      const ids = Object.keys(parents).map(Number).filter((id) => parents[id] === parentId);
      return { items: ids.map((id) => node(id)), pageInfo: { totalCount: ids.length, pageSize: limit, page: pageNumber, hasMore: false } };
    }),
    ancestors: vi.fn(async (id: number) => ({ items: [], node: { id, parentId: parents[id], page: 1 }, pageSize: 50 })),
    search: vi.fn(),
  };
}

/** A store whose requests are read straight from the API, standing in for TreeQueries over the cache */
function readingStore(api: TreeApi, invalidate?: (ids: ReadonlyArray<number>) => void): TreeStore {
  const store = new TreeStore(api, { invalidate });
  const started = new Set<ChildPageRequest>();
  store.subscribe(() =>
    store
      .getRequests()
      .filter((request) => !started.has(request))
      .forEach((request) => {
        started.add(request);
        api.children(request.parentId, request.page, request.limit).then(
          (data) => store.receive(request, { data }),
          (error: unknown) => store.receive(request, { error }),
        );
      }),
  );
  return store;
}

describe('createMoveApi', () => {
  it('posts the move with the token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 21, parentId: 0, previousParentId: 2, sort: 2, modifiedIds: [21] })));
    const client = createMoveApi('https://cms.test/admin/pages/move/', () => 'token-1', fetcher as unknown as typeof fetch);

    await client.move({ id: 21, parentId: 0, siblingIds: [1, 21, 2, 3] });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cms.test/admin/pages/move/page');
    expect((init.headers as Record<string, string>)['X-SecurityID']).toBe('token-1');
    expect(JSON.parse(String(init.body))).toEqual({ id: 21, parentId: 0, siblingIds: [1, 21, 2, 3] });
  });
});

describe('drop rules', () => {
  it('follow the legacy tree', () => {
    expect(canDragPage({ ...hints, canOrganise: false }, node(21))).toBe(false);
    expect(canDragPage({ ...hints, canCreateTopLevel: false }, node(1))).toBe(false);
    expect(canDropPage(hints, node(21), node(1))).toBe(true);
    expect(canDropPage(hints, node(21), node(1, { className: leaf }))).toBe(false);
    expect(canDropPage(hints, node(21), node(1, { canEdit: false }))).toBe(false);
    expect(canDropPage({ ...hints, rootClasses: [] }, node(21), null)).toBe(false);
    expect(canDropPage({ ...hints, rootClasses: [] }, node(1), null)).toBe(true);
  });

  it('allow a drop on a parent class the hints leave out', () => {
    expect(canDropPage(hints, node(21), node(1, { className: 'App\\HiddenPage' }))).toBe(true);
    expect(canDropPage(hints, node(21), node(1, { className: 'App\\HiddenPage', canEdit: false }))).toBe(false);
  });

  it('allow a class the hints leave out at the top level while canCreateTopLevel holds', () => {
    const unknown = node(21, { className: 'App\\HiddenPage' });
    expect(canDropPage({ ...hints, rootClasses: [] }, unknown, null)).toBe(true);
    expect(canDropPage({ ...hints, canCreateTopLevel: false }, unknown, null)).toBe(false);
  });

  it('check a virtual page by the class of the page it copies', () => {
    const virtualPage = 'SilverStripe\\CMS\\Model\\VirtualPage';
    const virtualHints: MoveHints = {
      ...hints,
      rootClasses: [virtualPage],
      allowedChildren: { [page]: [virtualPage], [leaf]: [leaf], [virtualPage]: [] },
    };
    const copiesLeaf = node(21, { className: virtualPage, copiedClassName: leaf });
    expect(canDropPage(virtualHints, copiesLeaf, node(1))).toBe(false);
    expect(canDropPage(virtualHints, copiesLeaf, node(1, { className: leaf }))).toBe(true);
    expect(canDropPage(virtualHints, copiesLeaf, null)).toBe(false);
    expect(canDropPage({ ...virtualHints, rootClasses: [leaf] }, copiesLeaf, null)).toBe(true);
  });
});

describe('movePage', () => {
  it('announces both parents and toasts once the server moves the page', async () => {
    const invalidate = vi.fn();
    const store = readingStore(fakeApi(), invalidate);
    await Promise.all([store.loadMore(0), store.loadMore(2)]);
    const client = { move: vi.fn(async () => ({ id: 21, parentId: 0, previousParentId: 2, sort: 2, modifiedIds: [21] })) };
    const notify = vi.fn();
    const moved = vi.spyOn(store, 'moved');

    parents[21] = 0;
    try {
      await movePage({ client, store, notify }, { id: 21, parentId: 0, siblingIds: [1, 21, 2, 3] }, 1);
    } finally {
      parents[21] = 2;
    }

    expect(moved).toHaveBeenCalledWith(expect.objectContaining({ previousParentId: 2 }));
    expect(invalidate).toHaveBeenCalledWith([2, 0, 21]);
    expect(notify).toHaveBeenCalledWith('Moved "Bravo 1"', 'success');
  });

  it('puts the page back when the server refuses', async () => {
    const store = readingStore(fakeApi());
    await Promise.all([store.loadMore(0), store.loadMore(2)]);
    const client = { move: vi.fn(async () => { throw new ApiError('Pages cannot be added under this page', 403, 'notAllowedHere'); }) };
    const notify = vi.fn();
    let heldDuringMove: ReadonlyArray<number> = [];
    client.move.mockImplementationOnce(async () => {
      heldDuringMove = store.children(0).ids;
      throw new ApiError('Pages cannot be added under this page', 403, 'notAllowedHere');
    });

    expect(await movePage({ client, store, notify }, { id: 21, parentId: 0, siblingIds: [21, 1, 2, 3] }, 0)).toBe(false);

    expect(heldDuringMove).toEqual([21, 1, 2, 3]);
    expect(store.children(0).ids).toEqual([1, 2, 3]);
    expect(store.children(2).ids).toEqual([21]);
    expect(store.node(21)?.parentId).toBe(2);
    expect(store.node(2)?.childCount).toBe(1);
    expect(notify).toHaveBeenCalledWith('"Bravo 1" could not be moved: Pages cannot be added under this page', 'error');
  });
});

describe('PageTree keyboard move', () => {
  async function renderTree(client: MoveApi) {
    const store = readingStore(fakeApi());
    await store.loadMore(0);
    const notify = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(PageTree, {
          store,
          currentId: null,
          onSelect: () => undefined,
          onRevealError: () => undefined,
          mover: { client, notify },
        }),
      );
    });
    const tree = host.querySelector('[role="tree"]') as HTMLElement;
    const press = async (...codes: Array<string>) => {
      await act(async () => {
        for (const code of codes) {
          tree.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
        }
        for (const code of codes) {
          document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
        }
        await new Promise((resolve) => setTimeout(resolve));
      });
    };
    return { store, notify, host, root, press };
  }

  it('posts the move a Control+Shift+D drag drops, and restores the order when it fails', async () => {
    const client: MoveApi = {
      hints: vi.fn(async () => hints),
      move: vi.fn(async () => {
        throw new ApiError('You do not have permission to rearrange the tree', 403, 'cannotOrganise');
      }),
    };
    const { store, notify, host, root, press } = await renderTree(client);

    await press('ControlLeft', 'ShiftLeft', 'KeyD');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Moving Alpha');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');

    expect(client.move).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(store.children(0).ids).toEqual([1, 2, 3]);
    expect(store.node(1)?.parentId).toBe(0);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('could not be moved'), 'error');
    act(() => root.unmount());
    host.remove();
  });
});
