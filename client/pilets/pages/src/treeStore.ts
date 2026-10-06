/**
 * The page tree's data, kept outside the tree component so paging, deep links and refreshes can change
 * it without the component knowing how. Children of a node load in pages: the first request asks for
 * `firstLimit` (the endpoint's default, 50), every later one for `moreLimit` (its maximum, 250). The
 * endpoint pages by page number, not offset, so a later page can overlap rows already held; merging by
 * offset keeps the list contiguous.
 *
 * Subscribers are told after every change; `version` lets React read the store through
 * useSyncExternalStore.
 */
import { ApiError } from './api';
import type { PageNode, TreeApi } from './api';

export const rootId = 0;

export interface ChildList {
  ids: ReadonlyArray<number>;
  total: number | null;
  loading: boolean;
  error: ApiError | null;
}

export interface TreeStoreOptions {
  firstLimit?: number;
  moreLimit?: number;
}

const emptyList: ChildList = { ids: [], total: null, loading: false, error: null };

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : String(error), 0, 'network');
}

export class TreeStore {
  readonly firstLimit: number;
  readonly moreLimit: number;
  version = 0;
  sessionExpired = false;
  private readonly nodes = new Map<number, PageNode>();
  private readonly lists = new Map<number, ChildList>();
  private readonly pending = new Map<number, Promise<void>>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly api: TreeApi,
    { firstLimit = 50, moreLimit = 250 }: TreeStoreOptions = {},
  ) {
    this.firstLimit = firstLimit;
    this.moreLimit = moreLimit;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

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
    const running = this.pending.get(parentId);
    if (running) {
      return running;
    }
    const held = this.children(parentId).ids.length;
    if (this.isLoaded(parentId) && !this.hasMore(parentId)) {
      return Promise.resolve();
    }
    const limit = held === 0 ? this.firstLimit : this.moreLimit;
    const page = Math.floor(held / limit) + 1;
    return this.track(parentId, this.fetchPages(parentId, limit, [page]));
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
    const running = this.pending.get(parentId);
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
    return this.track(parentId, this.fetchPages(parentId, this.moreLimit, pages));
  }

  /** Clears a failed load so the next request retries */
  retry(parentId: number): Promise<void> {
    this.patchList(parentId, { error: null });
    return this.loadMore(parentId);
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
    const known = this.knownPath(id);
    if (known) {
      return known;
    }
    const { items, node, pageSize } = await this.api.ancestors(id, this.firstLimit);
    this.upsert(items);
    const steps = [...items.map((item) => ({ parentId: item.parentId, page: item.page })), node];
    await Promise.all(steps.map((step) => this.loadThrough(step.parentId, (step.page ?? 1) * pageSize)));
    return items.map((item) => item.id);
  }

  /** Re-reads a page's row (title, flags, children) from its parent's listing, after a save */
  async refresh(id: number): Promise<void> {
    const { node, pageSize } = await this.api.ancestors(id, this.firstLimit);
    const { items } = await this.api.children(node.parentId, node.page ?? 1, pageSize);
    this.upsert(items.filter((item) => this.nodes.has(item.id)));
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

  private async fetchPages(parentId: number, limit: number, pages: Array<number>): Promise<void> {
    const responses = await Promise.all(pages.map((page) => this.api.children(parentId, page, limit)));
    let ids = [...this.children(parentId).ids];
    let total = this.children(parentId).total;
    for (const { items, pageInfo } of responses) {
      const offset = (pageInfo.page - 1) * pageInfo.pageSize;
      ids = [...ids.slice(0, offset), ...items.map((item) => item.id), ...ids.slice(offset + items.length)];
      total = pageInfo.totalCount;
      for (const item of items) {
        this.nodes.set(item.id, item);
      }
    }
    this.patchList(parentId, { ids, total });
  }

  private track(parentId: number, load: Promise<void>): Promise<void> {
    this.patchList(parentId, { loading: true, error: null });
    const tracked = load
      .catch((error: unknown) => {
        const apiError = toApiError(error);
        this.sessionExpired ||= apiError.sessionExpired;
        this.patchList(parentId, { error: apiError });
      })
      .finally(() => {
        this.pending.delete(parentId);
        this.patchList(parentId, { loading: false });
      });
    this.pending.set(parentId, tracked);
    return tracked;
  }

  private patchList(parentId: number, patch: Partial<ChildList>): void {
    this.lists.set(parentId, { ...this.children(parentId), ...patch });
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
