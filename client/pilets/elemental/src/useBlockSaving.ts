/**
 * Saving inline block forms: each open form's handle, which blocks are mid-save, and the
 * `onBeforeFormSubmit` hook that saves every dirty block before the page form posts, cancelling the
 * page save when one fails, as the legacy Entwine hook did.
 */
import type { PiletApi } from '@silverstripe/admin-shell';
import * as React from 'react';
import type { Block } from './api';
import { setIn } from './idSets';
import type { FormSchemaFormHandle } from './shell';

export interface BlockSavingOptions {
  api: PiletApi;
  /** The page form's id, whose posts this waits on */
  formId: string;
  blocksRef: { readonly current: Array<Block> | null };
  blockName: (block: Block) => string;
  /** Opens a block whose save failed, so its errors show */
  expand: (id: number) => void;
}

export interface BlockSaving {
  handles: { readonly current: Map<number, FormSchemaFormHandle> };
  saving: ReadonlySet<number>;
  /** Posts a block's form; true when saved, or when the block has no open form */
  saveBlock: (block: Block) => Promise<boolean>;
}

export function useBlockSaving({ api, formId, blocksRef, blockName, expand }: BlockSavingOptions): BlockSaving {
  const handles = React.useRef(new Map<number, FormSchemaFormHandle>());
  const [saving, setSaving] = React.useState<ReadonlySet<number>>(new Set());

  const saveBlock = async (block: Block): Promise<boolean> => {
    const handle = handles.current.get(block.id);
    if (!handle) {
      return true;
    }
    setIn(setSaving, block.id, true);
    try {
      const result = await handle.submit('action_save');
      if (!result.ok) {
        expand(block.id);
        api.showNotification(`"${blockName(block)}" could not be saved${result.message ? `: ${result.message}` : ''}`, {
          type: 'error',
        });
        return false;
      }
      return true;
    } finally {
      setIn(setSaving, block.id, false);
    }
  };

  const saveDirtyBlocks = React.useEffectEvent(async (submittingFormId: string): Promise<boolean> => {
    if (submittingFormId !== formId) {
      return true;
    }
    const dirtyBlocks = (blocksRef.current ?? []).filter((block) => handles.current.get(block.id)?.isDirty());
    for (const block of dirtyBlocks) {
      if (!(await saveBlock(block))) {
        api.showNotification('The page was not saved because a block could not be saved', { type: 'error' });
        return false;
      }
    }
    return true;
  });

  // Page Save and Publish save every dirty block first and stop if one fails
  React.useEffect(() => {
    if (!api.registerHook) {
      return undefined;
    }
    return api.registerHook('onBeforeFormSubmit', (context) => saveDirtyBlocks(context.formId));
  }, [api]);

  return { handles, saving, saveBlock };
}
