import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { AncestorsResponse, ChildrenResponse, PageNode, TreeApi } from './api';
import { childItemIds, entryFor, entryName, rootItemId } from './treeEntries';
import { TreeStore } from './treeStore';

// Shaped like PageTreeControllerTest.yml: a chain under Bravo and one wide parent
const titles: Record<number, [string, number]> = {
  1: ['Alpha', 0],
  2: ['Bravo', 0],
  3: ['Wide', 0],
  4: ['Deep 1', 2],
  5: ['Deep 2', 4],
};
for (let index = 1; index <= 12; index++) {
  titles[100 + index] = [`Wide ${index}`, 3];
}

function node(id: number): PageNode {
  const [title, parentId] = titles[id];
  const childCount = Object.values(titles).filter(([, parent]) => parent === id).length;
  return {
    id,
    parentId,
    title,
    menuTitle: title,
    urlSegment: title.toLowerCase(),
    className: 'Page',
    hasChildren: childCount > 0,
    childCount,
    statusFlags: id === 2 ? [{ key: 'addedtodraft', text: 'Draft', title: 'Page has not been published' }] : [],
    canEdit: true,
    canDelete: true,
    sort: id,
  };
}

function childIds(parentId: number): Array<number> {
  return Object.keys(titles)
    .map(Number)
    .filter((id) => titles[id][1] === parentId);
}

function fakeApi() {
  const api = {
    children: vi.fn(async (parentId: number, page: number, limit: number): Promise<ChildrenResponse> => {
      const all = childIds(parentId);
      const items = all.slice((page - 1) * limit, page * limit).map(node);
      return { items, pageInfo: { totalCount: all.length, pageSize: limit, page, hasMore: page * limit < all.length } };
    }),
    ancestors: vi.fn(async (id: number, limit: number): Promise<AncestorsResponse> => {
      const path: Array<number> = [];
      for (let parent = titles[id][1]; parent; parent = titles[parent][1]) {
        path.unshift(parent);
      }
      const pageOf = (pageId: number) => Math.floor(childIds(titles[pageId][1]).indexOf(pageId) / limit) + 1;
      return {
        items: path.map((ancestor) => ({ ...node(ancestor), page: pageOf(ancestor) })),
        node: { id, parentId: titles[id][1], page: pageOf(id) },
        limit,
      };
    }),
    search: vi.fn(),
  };
  return api as typeof api & TreeApi;
}

describe('TreeStore', () => {
  it('loads a first page, then larger pages that overlap without duplicating rows', async () => {
    const api = fakeApi();
    const store = new TreeStore(api, { firstLimit: 2, moreLimit: 5 });
    await store.loadMore(3);
    expect(store.children(3).ids).toEqual([101, 102]);
    expect(store.nextBatchSize(3)).toBe(3);
    await store.loadMore(3);
    expect(api.children).toHaveBeenLastCalledWith(3, 1, 5);
    expect(store.children(3).ids).toEqual([101, 102, 103, 104, 105]);
    await store.loadMore(3);
    await store.loadMore(3);
    expect(store.children(3).ids).toHaveLength(12);
    expect(store.hasMore(3)).toBe(false);
  });

  it('shares one request between callers', async () => {
    const api = fakeApi();
    const store = new TreeStore(api);
    await Promise.all([store.loadMore(0), store.loadMore(0)]);
    expect(api.children).toHaveBeenCalledTimes(1);
  });

  it('opens a deep link with one ancestors request and the pages each step is on', async () => {
    const api = fakeApi();
    const store = new TreeStore(api, { firstLimit: 2, moreLimit: 5 });
    expect(await store.revealPath(5)).toEqual([2, 4]);
    expect(api.ancestors).toHaveBeenCalledTimes(1);
    expect(store.children(0).ids).toContain(2);
    expect(store.children(4).ids).toEqual([5]);
    expect(await store.revealPath(5)).toEqual([2, 4]);
    expect(api.ancestors).toHaveBeenCalledTimes(1);
  });

  it('opens a page on the first page of its parent with the same request the tree makes', async () => {
    const api = fakeApi();
    const store = new TreeStore(api, { firstLimit: 2, moreLimit: 5 });
    await Promise.all([store.loadMore(0), store.revealPath(2)]);
    expect(api.children.mock.calls).toEqual([[0, 1, 2]]);
  });

  it('loads through the page a wide parent holds the target on', async () => {
    const api = fakeApi();
    const store = new TreeStore(api, { firstLimit: 2, moreLimit: 5 });
    await store.revealPath(112);
    expect(store.children(3).ids).toContain(112);
    expect(store.children(3).ids).toHaveLength(12);
  });

  it('refreshes a saved row in place', async () => {
    const api = fakeApi();
    const store = new TreeStore(api);
    await store.loadMore(0);
    titles[1][0] = 'Alpha renamed';
    await store.refresh(1);
    expect(store.node(1)?.title).toBe('Alpha renamed');
    titles[1][0] = 'Alpha';
  });

  it('keeps the error envelope and flags an expired session', async () => {
    const api = fakeApi();
    api.children.mockRejectedValueOnce(new ApiError('Not logged in', 401, 'notLoggedIn'));
    const store = new TreeStore(api);
    await store.loadMore(0);
    expect(store.children(0).error?.reason).toBe('notLoggedIn');
    expect(store.sessionExpired).toBe(true);
    expect(childItemIds(store, rootItemId)).toEqual(['error:0']);
    await store.retry(0);
    expect(store.children(0).ids).toEqual([1, 2, 3]);
  });
});

describe('tree entries', () => {
  it('asks for the first page and shows a loading row until it arrives', async () => {
    const api = fakeApi();
    const store = new TreeStore(api);
    expect(childItemIds(store, rootItemId)).toEqual(['loading:0']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(childItemIds(store, rootItemId)).toEqual(['1', '2', '3']);
  });

  it('adds a show-more row and names rows with their flags', async () => {
    const api = fakeApi();
    const store = new TreeStore(api, { firstLimit: 2, moreLimit: 5 });
    await store.loadMore(3);
    expect(childItemIds(store, '3')).toEqual(['101', '102', 'more:3']);
    expect(entryName(entryFor(store, 'more:3'))).toBe('Show 3 more');
    await store.loadMore(0);
    expect(entryName(entryFor(store, '2'))).toBe('Bravo (Draft)');
  });
});
