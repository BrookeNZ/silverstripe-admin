/**
 * The area's blocks as last read from elemental's endpoint, re-read when the page is saved or published
 * elsewhere, and the records-changed announcement for blocks this area changed.
 */
import * as React from 'react';
import type { Block, ElementalApi } from './api';
import { blockType } from './blocks';
import type { ElementType } from './blocks';
import type { ElementalPiletApi, RecordsChangedEvent } from './shell';

export interface BlockListOptions {
  api: ElementalPiletApi;
  client: ElementalApi;
  types: ReadonlyArray<ElementType>;
  pageClass: string;
  areaId: number;
  pageId: number;
}

export interface BlockList {
  /** Null until the first read */
  blocks: Array<Block> | null;
  setBlocks(blocks: Array<Block>): void;
  /** The blocks as of the last render, for handlers that run after awaiting */
  blocksRef: { readonly current: Array<Block> | null };
  loadError: string | null;
  /** Re-reads the blocks; null when the read failed */
  load(signal?: AbortSignal): Promise<Array<Block> | null>;
  /** Announces the blocks, and the page whose Modified badge they change, as records-changed */
  notifyChanged(changed: ReadonlyArray<Block>): void;
}

export function useBlockList({ api, client, types, pageClass, areaId, pageId }: BlockListOptions): BlockList {
  const [blocks, setBlocks] = React.useState<Array<Block> | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const blocksRef = React.useRef(blocks);
  blocksRef.current = blocks;
  const emitting = React.useRef(false);
  const latestRead = React.useRef(0);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const request = ++latestRead.current;
      try {
        const read = await client.readElements(areaId, signal);
        if (request === latestRead.current) {
          setBlocks(read);
          setLoadError(null);
        }
        return read;
      } catch (error) {
        if (!signal?.aborted && request === latestRead.current) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
        return null;
      }
    },
    [areaId],
  );

  React.useEffect(() => {
    const abort = new AbortController();
    load(abort.signal);
    return () => abort.abort();
  }, [load]);

  const notifyChanged = React.useCallback(
    (changed: ReadonlyArray<Block>) => {
      emitting.current = true;
      try {
        for (const block of changed) {
          const type = blockType(block, types);
          const event: RecordsChangedEvent = { recordClass: type?.class ?? 'DNADesign\\Elemental\\Models\\BaseElement', ids: [block.id] };
          api.emit(api.recordsChangedEvent, event);
        }
        // A block change alters the page's Modified badge in the tree
        const pageEvent: RecordsChangedEvent = { recordClass: pageClass, ids: [pageId] };
        api.emit(api.recordsChangedEvent, pageEvent);
      } finally {
        emitting.current = false;
      }
    },
    [pageId],
  );

  // A page save or publish changes its blocks' state (publish publishes them), so re-read
  React.useEffect(() => {
    const refresh = ({ recordClass, ids }: RecordsChangedEvent) => {
      if (!emitting.current && recordClass === pageClass && ids.includes(pageId)) {
        load();
      }
    };
    api.on(api.recordsChangedEvent, refresh);
    return () => {
      api.off(api.recordsChangedEvent, refresh);
    };
  }, [load, pageId]);

  return { blocks, setBlocks, blocksRef, loadError, load, notifyChanged };
}
