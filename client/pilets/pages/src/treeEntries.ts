/**
 * Maps the store onto the item IDs headless-tree works with. Pages use their ID as a string; the rows a
 * paged, lazy tree needs besides pages ("Show 200 more", a loading line, a failed load) are items too,
 * so arrow keys reach them and Enter activates them like any other row.
 */
import { rootId } from './treeStore';
import type { TreeStore } from './treeStore';
import type { PageNode } from './api';

export const rootItemId = 'root';

export type TreeEntry =
  | { kind: 'root' }
  | { kind: 'page'; node: PageNode }
  | { kind: 'more'; parentId: number; count: number }
  | { kind: 'loading'; parentId: number }
  | { kind: 'error'; parentId: number; message: string };

export function pageItemId(id: number): string {
  return String(id);
}

function parentOf(itemId: string): number {
  return itemId === rootItemId ? rootId : Number(itemId);
}

export function entryFor(store: TreeStore, itemId: string): TreeEntry {
  if (itemId === rootItemId) {
    return { kind: 'root' };
  }
  const [kind, parent] = itemId.split(':');
  const parentId = Number(parent);
  switch (kind) {
    case 'more':
      return { kind, parentId, count: store.nextBatchSize(parentId) };
    case 'loading':
      return { kind, parentId };
    case 'error':
      return { kind, parentId, message: store.children(parentId).error?.message ?? '' };
    default: {
      const node = store.node(Number(itemId));
      return node ? { kind: 'page', node } : { kind: 'loading', parentId: rootId };
    }
  }
}

/**
 * Children of an item for the tree, plus the paging, loading or error row; asks the store for the
 * first page when nothing is held yet. The tree reads this while it rebuilds, so the load starts later
 */
export function childItemIds(store: TreeStore, itemId: string): Array<string> {
  const parentId = parentOf(itemId);
  const list = store.children(parentId);
  const ids = list.ids.map(pageItemId);
  if (list.error) {
    return [...ids, `error:${parentId}`];
  }
  if (list.loading) {
    return [...ids, `loading:${parentId}`];
  }
  if (!store.isLoaded(parentId)) {
    queueMicrotask(() => void store.loadMore(parentId));
    return [`loading:${parentId}`];
  }
  return store.hasMore(parentId) ? [...ids, `more:${parentId}`] : ids;
}

export function entryName(entry: TreeEntry): string {
  switch (entry.kind) {
    case 'page': {
      const flags = entry.node.statusFlags.map((flag) => flag.text).filter(Boolean);
      return flags.length ? `${entry.node.title} (${flags.join(', ')})` : entry.node.title;
    }
    case 'more':
      return `Show ${entry.count} more`;
    case 'loading':
      return 'Loading pages…';
    case 'error':
      return `Pages could not be loaded: ${entry.message}. Press Enter to try again`;
    default:
      return 'Pages';
  }
}
