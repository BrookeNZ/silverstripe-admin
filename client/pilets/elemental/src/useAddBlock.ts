/**
 * The add dialog's state and the create it posts, appending or inserting after a block. The create
 * answers with no id, so the new block is the one the re-read adds; an inline-editable one opens.
 */
import * as React from 'react';
import type { Block, ElementalApi } from './api';
import type { ElementType } from './blocks';
import { insertId, menuId } from './BlockRow';
import { focusLater } from './areaDom';
import type { BlockList } from './useBlockList';
import type { ElementalPiletApi } from './shell';

export interface AddBlockOptions {
  api: ElementalPiletApi;
  client: ElementalApi;
  areaId: number;
  list: BlockList;
  /** Opens a new inline-editable block */
  open(id: number): void;
  /** Where focus goes when the new block cannot be found */
  addButtonId: string;
}

export interface AddBlock {
  adding: 'closed' | 'open' | 'posting';
  addError: string | null;
  /** The block the dialog inserts after; null to append */
  insertAfter: Block | null;
  openAddDialog(after: Block | null): void;
  closeAddDialog(): void;
  addBlock(type: ElementType): Promise<void>;
}

export function useAddBlock({ api, client, areaId, list, open, addButtonId }: AddBlockOptions): AddBlock {
  const { blocksRef, load, notifyChanged } = list;
  const [adding, setAdding] = React.useState<'closed' | 'open' | 'posting'>('closed');
  const [addError, setAddError] = React.useState<string | null>(null);
  const [insertAfter, setInsertAfter] = React.useState<Block | null>(null);
  const creating = React.useRef(false);

  const openAddDialog = (after: Block | null) => {
    setInsertAfter(after);
    setAddError(null);
    setAdding('open');
  };

  const addBlock = async (type: ElementType) => {
    // Two clicks in one tick both arrive before the loading state renders
    if (creating.current) {
      return;
    }
    creating.current = true;
    setAddError(null);
    setAdding('posting');
    const before = new Set((blocksRef.current ?? []).map((block) => block.id));
    try {
      await (insertAfter ? client.create(type.class, areaId, insertAfter.id) : client.create(type.class, areaId));
    } catch (error) {
      setAdding('open');
      setAddError(`The block could not be added: ${error instanceof Error ? error.message : String(error)}`);
      return;
    } finally {
      creating.current = false;
    }
    setAdding('closed');
    const read = await load();
    const created = read?.find((block) => !before.has(block.id));
    api.showNotification(`Added a ${type.title} block`, { type: 'success', autoClose: 5000 });
    if (created) {
      notifyChanged([created]);
      if (type.inlineEditable) {
        open(created.id);
      }
      focusLater(menuId(created));
    } else {
      focusLater(insertAfter ? insertId(insertAfter) : addButtonId);
    }
  };

  return { adding, addError, insertAfter, openAddDialog, closeAddDialog: () => setAdding('closed'), addBlock };
}
