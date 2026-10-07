/**
 * The page tree's data, kept outside the tree component so paging, deep links and refreshes can change
 * it without the component knowing how. The rows live in the shell's server cache: each page of a parent's
 * children is one cached read under `childPageKey`, which `TreeQueries` (PagesSection.tsx) reads for every
 * request the store lists and hands back through `receive`. The store is a selector over those pages: it
 * merges each parent's pages into one list and keeps the rows by id.
 *
 * Children load in pages: the first request asks for `firstLimit` (the endpoint's default, 50), every
 * later one for `moreLimit` (its maximum, 250). The endpoint pages by page number, not offset, so a later
 * page can overlap rows already held; merging by offset keeps the list contiguous.
 *
 * Writes announce SiteTree records as changed through `invalidate`, and the shell refetches every cached
 * listing keyed by a named parent or showing a named row. A row that drops out of its parent's listing
 * may have moved under another parent (a save of the settings form), so the store asks where it went and
 * announces both parents.
 *
 * Subscribers are told after every change; `version` lets React read the store through
 * useSyncExternalStore.
 */
import { toApiError } from './api';
import type { ApiError, ChildrenResponse, PageNode, TreeApi } from './api';
import type { MovedPage } from './move';

export const rootId = 0;

/** The class tree keys and records-changed events for pages name, whatever a page's own class */
export const siteTreeClass = 'SilverStripe\\CMS\\Model\\SiteTree';

export interface ChildList {
  ids: ReadonlyArray<number>;
  total: number | null;
  loading: boolean;
  error: ApiError | null;
}

/** One page of a parent's children the tree wants; `attempt` changes when a failed read is retried */
export interface ChildPageRequest {
  readonly parentId: number;
  readonly page: number;
  readonly limit: number;
  readonly attempt: number;
}

export type ChildPageKey = readonly [string, number, 'children', number, number];

export interface ChildPageResult {
  data?: ChildrenResponse;
  error?: unknown;
}

export interface TreeStoreOptions {
  firstLimit?: number;
  moreLimit?: number;
  /** Announces SiteTree records as changed, which refetches the cached listings keyed by or showing them */
  invalidate?(ids: ReadonlyArray<number>): void;
}

export function childPageKey({ parentId, page, limit }: Pick<ChildPageRequest, 'parentId' | 'page' | 'limit'>): ChildPageKey {
  return [siteTreeClass, parentId, 'children', page, limit];
}

/** The rows a page of children shows, for the cache's `records` option */
export function childPageRecords(response: ChildrenResponse): ReadonlyArray<number> {
  return response.items.map((item) => item.id);
}

interface RequestState {
  request: ChildPageRequest;
  data?: ChildrenResponse;
  error?: ApiError;
  done: boolean;
  settled: Promise<void>;
  settle(): void;
}

const emptyList: ChildList = { ids: [], total: null, loading: false, error: null };

function requestState(request: ChildPageRequest): RequestState {
  let settle = () => undefined as void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { request, done: false, settled, settle };
}

export class TreeStore {
  readonly firstLimit: number;
  readonly moreLimit: number;
  version = 0;
  sessionExpired = false;
  private readonly nodes = new Map<number, PageNode>();
  private readonly lists = new Map<number, ChildList>();
  private readonly requests = new Map<number, Array<RequestState>>();
  private requestList: ReadonlyArray<ChildPageRequest> = [];
  private readonly revealErrors = new Map<number, ApiError>();
  private readonly listeners = new Set<() => void>();
  private readonly invalidate: (ids: ReadonlyArray<number>) => void;

  constructor(
    private readonly api: TreeApi,
    { firstLimit = 50, moreLimit = 250, invalidate = () => undefined }: TreeStoreOptions = {},
  ) {
    this.firstLimit = firstLimit;
    this.moreLimit = moreLimit;
    this.invalidate = invalidate;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /** The pages of children to read; the same array until a request is added or retried */
  getRequests = (): ReadonlyArray<ChildPageRequest> => this.requestList;

  node(id: number): PageNode | undefined {
    return this.nodes.get(id);
  }

  children(parentId: number): ChildList {
    return this.lists.get(parentId) ?? emptyList;
  }

  isLoaded(parentId: number): boolean {
    return this.children(parentId).total !== null;
  }

  hasMore(parentId: number): boolean {
    const list = this.children(parentId);
    return list.total !== null && list.ids.length < list.total;
  }

  /** Why the last reveal of the page failed, until it is revealed again */
  revealError(id: number): ApiError | null {
    return this.revealErrors.get(id) ?? null;
  }

  /** How many rows the next loadMore() adds */
  nextBatchSize(parentId: number): number {
    const { ids, total } = this.children(parentId);
    if (total === null) {
      return 0;
    }
    const boundary = (Math.floor(ids.length / this.moreLimit) + 1) * this.moreLimit;
    return Math.min(total, boundary) - ids.length;
  }

  /** Loads the next page of children: the first page, or the next `moreLimit` rows */
  loadMore(parentId: number): Promise<void> {
    const running = this.pending(parentId);
    if (running) {
      return running;
    }
    const held = this.children(parentId).ids.length;
    if (this.isLoaded(parentId) && !this.hasMore(parentId)) {
      return Promise.resolve();
    }
    const limit = held === 0 ? this.firstLimit : this.moreLimit;
    return this.demand(parentId, limit, [Math.floor(held / limit) + 1]);
  }

  /**
   * Loads children until the first `rows` are held: the first page when that is enough, otherwise the
   * missing `moreLimit` pages in parallel. Used to open a deep link at the position the ancestors
   * endpoint reported
   */
  loadThrough(parentId: number, rows: number): Promise<void> {
    const { ids, total } = this.children(parentId);
    if (this.isLoaded(parentId) && ids.length >= Math.min(rows, total ?? Infinity)) {
      return Promise.resolve();
    }
    const running = this.pending(parentId);
    if (running) {
      return running.then(() => this.loadThrough(parentId, rows));
    }
    if (ids.length === 0 && rows <= this.firstLimit) {
      return this.loadMore(parentId);
    }
    const pages: Array<number> = [];
    for (let page = Math.floor(ids.length / this.moreLimit) + 1; page <= Math.ceil(rows / this.moreLimit); page++) {
      pages.push(page);
    }
    return this.demand(parentId, this.moreLimit, pages);
  }

  /** Asks again for the parent's pages that failed */
  retry(parentId: number): Promise<void> {
    const states = this.requests.get(parentId) ?? [];
    if (!states.some((state) => state.error && !state.data)) {
      return this.loadMore(parentId);
    }
    const retried = states.map((state) =>
      state.error && !state.data ? requestState({ ...state.request, attempt: state.request.attempt + 1 }) : state,
    );
    this.requests.set(parentId, retried);
    this.publishRequests();
    this.fold(parentId);
    return Promise.all(retried.map((state) => state.settled)).then(() => undefined);
  }

  /** Takes a page of children the cache read for `request`; a superseded attempt is ignored */
  receive(request: ChildPageRequest, { data, error }: ChildPageResult): void {
    const state = this.requests
      .get(request.parentId)
      ?.find((held) => held.request.page === request.page && held.request.limit === request.limit && held.request.attempt === request.attempt);
    if (!state) {
      return;
    }
    if (error) {
      const apiError = toApiError(error);
      this.sessionExpired ||= apiError.sessionExpired;
      state.error = data ? undefined : apiError;
    } else {
      state.error = undefined;
    }
    if (data) {
      state.data = data;
      for (const item of data.items) {
        this.nodes.set(item.id, item);
      }
    }
    state.done = true;
    state.settle();
    this.fold(request.parentId);
  }

  upsert(items: ReadonlyArray<PageNode>): void {
    for (const item of items) {
      this.nodes.set(item.id, item);
    }
    this.changed();
  }

  /**
   * The IDs from the top-level ancestor down to the page's parent, loading whatever is missing so each
   * step and the page itself are in their parent's loaded children
   */
  async revealPath(id: number): Promise<Array<number>> {
    if (this.revealErrors.delete(id)) {
      this.changed();
    }
    const known = this.knownPath(id);
    if (known) {
      return known;
    }
    try {
      const { items, node, pageSize } = await this.api.ancestors(id, this.firstLimit);
      this.upsert(items);
      const steps = [...items.map((item) => ({ parentId: item.parentId, page: item.page })), node];
      await Promise.all(steps.map((step) => this.loadThrough(step.parentId, (step.page ?? 1) * pageSize)));
      return items.map((item) => item.id);
    } catch (error: unknown) {
      const apiError = toApiError(error);
      this.sessionExpired ||= apiError.sessionExpired;
      this.revealErrors.set(id, apiError);
      this.changed();
      throw apiError;
    }
  }

  /** Announces the parent a page was created under, so its listing and its own row are read again */
  childAdded(parentId: number): Promise<void> {
    this.invalidate([parentId]);
    return Promise.resolve();
  }

  /**
   * Moves a held page to `index` among its new parent's held children before the server answers, and
   * returns a function that puts back both lists and every row it changed
   */
  move(id: number, parentId: number, index: number): () => void {
    const node = this.nodes.get(id);
    if (!node) {
      return () => undefined;
    }
    const oldParentId = node.parentId;
    const lists = new Map([oldParentId, parentId].map((listId) => [listId, this.lists.get(listId)]));
    const rows = new Map([id, oldParentId, parentId].map((rowId) => [rowId, this.nodes.get(rowId)]));

    const left = this.children(oldParentId);
    this.lists.set(oldParentId, {
      ...left,
      ids: left.ids.filter((held) => held !== id),
      total: left.total === null || oldParentId === parentId ? left.total : left.total - 1,
    });
    const target = this.children(parentId);
    if (this.isLoaded(parentId)) {
      const ids = [...target.ids];
      ids.splice(Math.min(index, ids.length), 0, id);
      this.lists.set(parentId, {
        ...target,
        ids,
        total: oldParentId === parentId ? target.total : (target.total ?? 0) + 1,
      });
    }
    this.nodes.set(id, { ...node, parentId });
    if (oldParentId !== parentId) {
      this.recount(oldParentId, -1);
      this.recount(parentId, 1);
    }
    this.changed();

    return () => {
      for (const [listId, list] of lists) {
        if (list) {
          this.lists.set(listId, list);
        } else {
          this.lists.delete(listId);
        }
      }
      for (const [rowId, row] of rows) {
        if (row) {
          this.nodes.set(rowId, row);
        }
      }
      this.changed();
    };
  }

  /** Announces both parents of a page the server moved, and any other row the move changed */
  moved({ parentId, previousParentId, modifiedIds }: MovedPage): Promise<void> {
    this.invalidate([...new Set([previousParentId, parentId, ...modifiedIds])]);
    return Promise.resolve();
  }

  private pending(parentId: number): Promise<void> | null {
    const waiting = (this.requests.get(parentId) ?? []).filter((state) => !state.done);
    return waiting.length > 0 ? Promise.all(waiting.map((state) => state.settled)).then(() => undefined) : null;
  }

  private demand(parentId: number, limit: number, pages: ReadonlyArray<number>): Promise<void> {
    const states = this.requests.get(parentId) ?? [];
    const wanted = pages.map(
      (page) =>
        states.find((state) => state.request.page === page && state.request.limit === limit) ??
        requestState({ parentId, page, limit, attempt: 0 }),
    );
    const added = wanted.filter((state) => !states.includes(state));
    if (added.length > 0) {
      this.requests.set(parentId, [...states, ...added]);
      this.publishRequests();
      this.fold(parentId);
    }
    return Promise.all(wanted.map((state) => state.settled)).then(() => undefined);
  }

  private publishRequests(): void {
    this.requestList = [...this.requests.values()].flatMap((states) => states.map((state) => state.request));
  }

  /** Merges the parent's pages in the order they were asked for, then asks after rows that dropped out */
  private fold(parentId: number): void {
    const states = this.requests.get(parentId) ?? [];
    let ids: Array<number> = [];
    let total: number | null = null;
    for (const { data } of states) {
      if (!data) {
        continue;
      }
      const { items, pageInfo } = data;
      const offset = (pageInfo.page - 1) * pageInfo.pageSize;
      const tail = pageInfo.hasMore ? ids.slice(offset + items.length) : [];
      ids = [...ids.slice(0, offset), ...items.map((item) => item.id), ...tail];
      total = pageInfo.totalCount;
    }
    ids = [...new Set(ids)];
    const loading = states.some((state) => !state.done);
    const previous = this.children(parentId).ids;
    this.lists.set(parentId, {
      ids,
      total,
      loading,
      error: states.find((state) => state.error)?.error ?? null,
    });
    this.changed();
    if (!loading) {
      previous.filter((id) => !ids.includes(id)).forEach((id) => this.relocate(id, parentId));
    }
  }

  private relocate(id: number, formerParentId: number): void {
    this.api
      .ancestors(id, this.firstLimit)
      .then(({ items, node }) => {
        if (node.parentId === formerParentId) {
          return;
        }
        const row = this.nodes.get(id);
        this.upsert(row ? [...items, { ...row, parentId: node.parentId }] : items);
        this.invalidate([formerParentId, node.parentId]);
      })
      .catch(() => undefined);
  }

  private recount(parentId: number, change: number): void {
    const parent = this.nodes.get(parentId);
    if (parent) {
      const childCount = Math.max(0, parent.childCount + change);
      this.nodes.set(parentId, { ...parent, childCount, hasChildren: childCount > 0 });
    }
  }

  private knownPath(id: number): Array<number> | null {
    const path: Array<number> = [];
    let current = this.nodes.get(id);
    while (current) {
      if (!this.children(current.parentId).ids.includes(current.id)) {
        return null;
      }
      if (current.parentId === rootId) {
        return path;
      }
      path.unshift(current.parentId);
      current = this.nodes.get(current.parentId);
    }
    return null;
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
