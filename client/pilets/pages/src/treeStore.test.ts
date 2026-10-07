import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { AncestorsResponse, ChildrenResponse, PageNode, TreeApi } from './api';
import { pageAncestors } from './PagesSection';
import { childItemIds, entryFor, entryName, rootItemId } from './treeEntries';
import { childPageKey, childPageRecords, TreeStore } from './treeStore';
import type { ChildPageRequest, TreeStoreOptions } from './treeStore';

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
        pageSize: limit,
      };
    }),
    search: vi.fn(),
  };
  return api as typeof api & TreeApi;
}

/**
 * A store over a stand-in for TreeQueries and the shell cache: each request is read once, and read again
 * when an announcement names its parent or a row it shows, as the shell matches SiteTree keys
 */
function cachedStore(api: TreeApi, options: Omit<TreeStoreOptions, 'invalidate'> = {}) {
  const held = new Map<string, ChildrenResponse>();
  const started = new Set<ChildPageRequest>();
  const announced: Array<ReadonlyArray<number>> = [];
  const read = (request: ChildPageRequest) =>
    api.children(request.parentId, request.page, request.limit).then(
      (data) => {
        held.set(childPageKey(request).join(), data);
        store.receive(request, { data });
      },
      (error: unknown) => store.receive(request, { error }),
    );
  const announce = (ids: ReadonlyArray<number>) => {
    announced.push(ids);
    for (const request of store.getRequests()) {
      const data = held.get(childPageKey(request).join());
      if (ids.includes(request.parentId) || (data && childPageRecords(data).some((id) => ids.includes(id)))) {
        void read(request);
      }
    }
  };
  const store = new TreeStore(api, { ...options, invalidate: announce });
  store.subscribe(() =>
    store
      .getRequests()
      .filter((request) => !started.has(request))
      .forEach((request) => {
        started.add(request);
        void read(request);
      }),
  );
  return { store, announce, announced };
}

const settle = async () => {
  for (let tick = 0; tick < 10; tick++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('TreeStore', () => {
  it('loads a first page, then larger pages that overlap without duplicating rows', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api, { firstLimit: 2, moreLimit: 5 });
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
    const { store } = cachedStore(api);
    await Promise.all([store.loadMore(0), store.loadMore(0)]);
    expect(api.children).toHaveBeenCalledTimes(1);
  });

  it('opens a deep link with one ancestors request and the pages each step is on', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api, { firstLimit: 2, moreLimit: 5 });
    expect(await store.revealPath(5)).toEqual([2, 4]);
    expect(api.ancestors).toHaveBeenCalledTimes(1);
    expect(store.children(0).ids).toContain(2);
    expect(store.children(4).ids).toEqual([5]);
    expect(await store.revealPath(5)).toEqual([2, 4]);
    expect(api.ancestors).toHaveBeenCalledTimes(1);
  });

  it('opens a page on the first page of its parent with the same request the tree makes', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api, { firstLimit: 2, moreLimit: 5 });
    await Promise.all([store.loadMore(0), store.revealPath(2)]);
    expect(api.children.mock.calls).toEqual([[0, 1, 2]]);
  });

  it('loads through the page a wide parent holds the target on', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api, { firstLimit: 2, moreLimit: 5 });
    await store.revealPath(112);
    expect(store.children(3).ids).toContain(112);
    expect(store.children(3).ids).toHaveLength(12);
  });

  it('keys each page of children by the SiteTree class and the parent', () => {
    expect(childPageKey({ parentId: 4, page: 2, limit: 250 })).toEqual(['SilverStripe\\CMS\\Model\\SiteTree', 4, 'children', 2, 250]);
  });

  it('re-reads a saved row in place when SiteTree is announced for it', async () => {
    const api = fakeApi();
    const { store, announce } = cachedStore(api);
    await Promise.all([store.loadMore(0), store.loadMore(2)]);
    api.children.mockClear();
    titles[1][0] = 'Alpha renamed';
    try {
      announce([1]);
      await settle();
    } finally {
      titles[1][0] = 'Alpha';
    }
    expect(store.node(1)?.title).toBe('Alpha renamed');
    expect(api.children.mock.calls.map(([parentId]) => parentId)).toEqual([0]);
  });

  it('announces the parent a page was created under', async () => {
    const api = fakeApi();
    const { store, announced } = cachedStore(api);
    await Promise.all([store.loadMore(0), store.loadMore(2), store.loadMore(4)]);
    api.children.mockClear();
    await store.childAdded(4);
    await settle();
    expect(announced).toEqual([[4]]);
    expect(api.children.mock.calls.map(([parentId]) => parentId).sort()).toEqual([2, 4]);
  });

  it('moves a page whose parent changed, to the top level and back, with its ancestors following', async () => {
    const api = fakeApi();
    const { store, announce } = cachedStore(api);
    await store.revealPath(5);
    const trail = () => pageAncestors(store, 5).map(({ title }) => title);
    expect(trail()).toEqual(['Bravo', 'Deep 1']);
    const respond = api.children.getMockImplementation();
    api.children.mockImplementation(async (parentId, page, limit) => {
      if (parentId === 4) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return respond!(parentId, page, limit);
    });
    let heldTwice = false;
    store.subscribe(() => {
      heldTwice ||= store.children(0).ids.includes(5) && store.children(4).ids.includes(5);
    });
    try {
      titles[5][1] = 0;
      announce([5]);
      await settle();
      expect(store.children(0).ids).toEqual([1, 2, 3, 5]);
      expect(store.children(4).ids).toEqual([]);
      expect(store.node(4)?.hasChildren).toBe(false);
      expect(trail()).toEqual([]);

      titles[5][1] = 4;
      announce([5]);
      await settle();
      expect(store.children(0).ids).toEqual([1, 2, 3]);
      expect(store.children(4).ids).toEqual([5]);
      expect(store.node(4)?.hasChildren).toBe(true);
      expect(trail()).toEqual(['Bravo', 'Deep 1']);
      expect(heldTwice).toBe(false);
    } finally {
      titles[5][1] = 4;
    }
  });

  it('moves a page before the server answers and puts it back on undo', async () => {
    const { store } = cachedStore(fakeApi());
    await Promise.all([store.loadMore(0), store.loadMore(2)]);
    const undo = store.move(4, 0, 1);
    expect(store.children(0).ids).toEqual([1, 4, 2, 3]);
    expect(store.children(2).ids).toEqual([]);
    expect(store.node(2)?.hasChildren).toBe(false);
    expect(store.node(4)?.parentId).toBe(0);
    undo();
    expect(store.children(0).ids).toEqual([1, 2, 3]);
    expect(store.children(2).ids).toEqual([4]);
    expect(store.node(2)?.hasChildren).toBe(true);
    expect(store.node(4)?.parentId).toBe(2);
  });

  it('re-reads both parents after a move', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api);
    await Promise.all([store.loadMore(0), store.loadMore(2)]);
    api.children.mockClear();
    await store.moved({ id: 4, parentId: 0, previousParentId: 2, sort: 2, modifiedIds: [4] });
    await settle();
    expect(api.children.mock.calls.map(([parentId]) => parentId).sort()).toEqual([0, 2]);
  });

  it('keeps the error envelope and flags an expired session', async () => {
    const api = fakeApi();
    api.children.mockRejectedValueOnce(new ApiError('Not logged in', 401, 'notLoggedIn'));
    const { store } = cachedStore(api);
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
    const { store } = cachedStore(api);
    expect(childItemIds(store, rootItemId)).toEqual(['loading:0']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(childItemIds(store, rootItemId)).toEqual(['1', '2', '3']);
  });

  it('adds a show-more row and names rows with their flags', async () => {
    const api = fakeApi();
    const { store } = cachedStore(api, { firstLimit: 2, moreLimit: 5 });
    await store.loadMore(3);
    expect(childItemIds(store, '3')).toEqual(['101', '102', 'more:3']);
    expect(entryName(entryFor(store, 'more:3'))).toBe('Show 3 more');
    await store.loadMore(0);
    expect(entryName(entryFor(store, '2'))).toBe('Bravo (Draft)');
  });
});
