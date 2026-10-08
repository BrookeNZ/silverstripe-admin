/**
 * The block menu's built-in actions (move, publish, unpublish, duplicate, archive) as writes to
 * elemental's endpoints. Each write answers with no body, so the list is re-read after it, and focus
 * goes back to the block's menu, or to the copy a duplicate made.
 */
import type { PiletApi } from '@silverstripe/admin-shell';
import * as React from 'react';
import type { Block, ElementalApi } from './api';
import { afterBlockId, moveBlock } from './blocks';
import { menuId } from './BlockRow';
import type { BuiltInBlockAction } from './BlockRow';
import { focusLater } from './areaDom';
import type { BlockList } from './useBlockList';
import type { BlockSaving } from './useBlockSaving';

const actionMessages: Readonly<Record<'publish' | 'unpublish' | 'archive' | 'duplicate', (title: string) => string>> = {
  publish: (title) => `Published "${title}"`,
  unpublish: (title) => `Unpublished "${title}"`,
  archive: (title) => `Archived "${title}"`,
  duplicate: (title) => `Duplicated "${title}"`,
};

export interface BlockActionsOptions {
  api: PiletApi;
  client: ElementalApi;
  list: BlockList;
  saving: BlockSaving;
  blockName: (block: Block) => string;
  /** Drops an archived block's form state */
  forget: (id: number) => void;
  /** Where focus goes when the last block is archived */
  addButtonId: string;
}

export interface BlockActions {
  /** The block whose write is in flight */
  busy: number | null;
  /** The block waiting on the archive confirmation */
  archiving: Block | null;
  cancelArchive: () => void;
  confirmArchive: () => Promise<void>;
  onAction: (block: Block, action: BuiltInBlockAction) => Promise<void>;
  /** Moves a block to an index, optimistically, then focuses `focusId` */
  move: (block: Block, toIndex: number, focusId: string) => Promise<void>;
}

export function useBlockActions({ api, client, list, saving, blockName, forget, addButtonId }: BlockActionsOptions): BlockActions {
  const { blocksRef, setBlocks, load, notifyChanged } = list;
  const { handles, saveBlock } = saving;
  const [busy, setBusy] = React.useState<number | null>(null);
  const [archiving, setArchiving] = React.useState<Block | null>(null);

  const runWrite = async (block: Block, write: () => Promise<void>, message: string | null): Promise<Array<Block> | null> => {
    setBusy(block.id);
    try {
      await write();
      if (message) {
        api.showNotification(message, { type: 'success', autoClose: 5000 });
      }
      notifyChanged([block]);
      return await load();
    } catch (error) {
      api.showNotification(error instanceof Error ? error.message : String(error), { type: 'error' });
      // An optimistic move is undone by reading the order back
      await load();
      return null;
    } finally {
      setBusy(null);
    }
  };

  const move = async (block: Block, toIndex: number, focusId: string) => {
    const current = blocksRef.current ?? [];
    const after = afterBlockId(current, block.id, toIndex);
    setBlocks(moveBlock(current, block.id, toIndex));
    await runWrite(block, () => client.sort(block.id, after), null);
    focusLater(focusId);
  };

  const onAction = async (block: Block, action: BuiltInBlockAction) => {
    const index = (blocksRef.current ?? []).findIndex((candidate) => candidate.id === block.id);
    const title = blockName(block);
    switch (action) {
      case 'archive':
        setArchiving(block);
        return;
      case 'moveUp':
        await move(block, index - 1, menuId(block));
        return;
      case 'moveDown':
        await move(block, index + 1, menuId(block));
        return;
      case 'publish':
        // Publishing posts the saved draft, so unsaved inline changes are saved first
        if (handles.current.get(block.id)?.isDirty() && !(await saveBlock(block))) {
          return;
        }
        await runWrite(block, () => client.publish(block.id), actionMessages.publish(title));
        break;
      case 'unpublish':
        await runWrite(block, () => client.unpublish(block.id), actionMessages.unpublish(title));
        break;
      case 'duplicate': {
        const before = new Set((blocksRef.current ?? []).map((candidate) => candidate.id));
        const read = await runWrite(block, () => client.duplicate(block.id), actionMessages.duplicate(title));
        const copy = read?.find((candidate) => !before.has(candidate.id));
        if (copy) {
          focusLater(menuId(copy));
          return;
        }
        break;
      }
    }
    focusLater(menuId(block));
  };

  const confirmArchive = async () => {
    const block = archiving;
    setArchiving(null);
    if (!block) {
      return;
    }
    const current = blocksRef.current ?? [];
    const index = current.findIndex((candidate) => candidate.id === block.id);
    const neighbour = current[index + 1] ?? current[index - 1];
    let archived = false;
    await runWrite(
      block,
      async () => {
        await client.archive(block.id);
        archived = true;
      },
      actionMessages.archive(blockName(block)),
    );
    if (!archived) {
      focusLater(menuId(block));
      return;
    }
    handles.current.delete(block.id);
    forget(block.id);
    focusLater(neighbour ? menuId(neighbour) : addButtonId);
  };

  return { busy, archiving, cancelArchive: () => setArchiving(null), confirmArchive, onAction, move };
}
