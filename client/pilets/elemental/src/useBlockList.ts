/**
 * The area's blocks, read through the shell's server cache under `['shared:blocks', areaId]`, and the
 * records-changed announcement for blocks this area changed. The key is in the shared scope because
 * `blocks` is reserved to the shell, and the shared scope keeps its every-change matching.
 *
 * The field's schema carries the same list as `data.blocks`, which seeds the first result. It counts as
 * fetched at mount, as the schema loaded just before, so a fresh mount makes no read and a remount after
 * SCHEMA_BLOCKS_FRESH_MS reads behind the cached list, as legacy re-reads on returning to the page. The cache invalidates the `blocks` scope on every
 * records-changed event, so a page save or publish elsewhere (publish publishes the blocks too) re-reads
 * the list without a listener here. A reorder shows its
 * new order straight away and holds it until the next read arrives.
 */
import type { PiletApi } from '@silverstripe/admin-shell';
import * as React from 'react';
import type { Block, ElementalApi } from './api';
import { blockType } from './blocks';
import type { ElementType } from './blocks';
import type { RecordsChangedEvent } from './shell';

export interface BlockListOptions {
  api: PiletApi;
  client: ElementalApi;
  types: ReadonlyArray<ElementType>;
  pageClass: string;
  areaId: number;
  pageId: number;
  /** The list the field's schema sent */
  schemaBlocks?: Array<Block> | null;
}

export interface BlockList {
  /** Null until the first read */
  blocks: Array<Block> | null;
  setBlocks: (blocks: Array<Block>) => void;
  /** The blocks as of the last render, for handlers that run after awaiting */
  blocksRef: { readonly current: Array<Block> | null };
  loadError: string | null;
  /** Re-reads the blocks; null when there is no list to show */
  load: () => Promise<Array<Block> | null>;
  /** Announces the blocks, and the page whose Modified badge they change, as records-changed */
  notifyChanged: (changed: ReadonlyArray<Block>) => void;
}

// Long enough to cover the schema load that mounted the field, short enough that returning to the page re-reads
export const SCHEMA_BLOCKS_FRESH_MS = 30_000;

export function useBlockList({ api, client, types, pageClass, areaId, pageId, schemaBlocks }: BlockListOptions): BlockList {
  const [mountedAt] = React.useState(() => Date.now());
  const query = api.useServerQuery(['shared:blocks', areaId], ({ signal }) => client.readElements(areaId, signal), {
    initialData: schemaBlocks ?? undefined,
    initialDataUpdatedAt: mountedAt,
    staleTime: SCHEMA_BLOCKS_FRESH_MS,
  });
  const read = query.data ?? null;
  const [local, setLocal] = React.useState({ read, blocks: read });
  if (local.read !== read) {
    setLocal({ read, blocks: read });
  }
  const blocks = local.read === read ? local.blocks : read;
  const setBlocks = React.useCallback((next: Array<Block>) => setLocal({ read, blocks: next }), [read]);

  const blocksRef = React.useRef(blocks);
  React.useLayoutEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const { refetch } = query;
  const load = React.useCallback(async () => (await refetch()) ?? null, [refetch]);

  const notifyChanged = React.useCallback(
    (changed: ReadonlyArray<Block>) => {
      for (const block of changed) {
        const type = blockType(block, types);
        const event: RecordsChangedEvent = { recordClass: type?.class ?? 'DNADesign\\Elemental\\Models\\BaseElement', ids: [block.id] };
        api.emit(api.recordsChangedEvent, event);
      }
      // A block change alters the page's Modified badge in the tree
      const pageEvent: RecordsChangedEvent = { recordClass: pageClass, ids: [pageId] };
      api.emit(api.recordsChangedEvent, pageEvent);
    },
    [api, types, pageClass, pageId],
  );

  return { blocks, setBlocks, blocksRef, loadError: query.error?.message ?? null, load, notifyChanged };
}
