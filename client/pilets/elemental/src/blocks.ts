/**
 * Pure helpers over the block list: element type lookup, a block's publication status and the
 * `afterBlockID` the sort endpoint wants for a move
 */
import type { Block } from './api';

/** An entry of the ElementalAreaController section's `elementTypes` client config */
export interface ElementType {
  name: string;
  class: string;
  title: string;
  icon: string;
  inlineEditable: boolean;
  broken?: boolean;
}

export type BlockStatus = 'draft' | 'modified' | 'published';

export const statusLabels: Readonly<Record<BlockStatus, string>> = {
  draft: 'Draft',
  modified: 'Modified',
  published: 'Published',
};

export function blockStatus(block: Pick<Block, 'isPublished' | 'isLiveVersion'>): BlockStatus {
  if (!block.isPublished) {
    return 'draft';
  }
  return block.isLiveVersion ? 'published' : 'modified';
}

export function blockType(block: Block, types: ReadonlyArray<ElementType>): ElementType | undefined {
  return types.find((type) => type.name === block.blockSchema.typeName);
}

/** The id the moved block goes after once it sits at `toIndex` of the list without it; 0 for first */
export function afterBlockId(blocks: ReadonlyArray<Pick<Block, 'id'>>, movedId: number, toIndex: number): number {
  const others = blocks.filter((block) => block.id !== movedId);
  return toIndex <= 0 ? 0 : others[Math.min(toIndex, others.length) - 1].id;
}

export function moveBlock<T extends Pick<Block, 'id'>>(blocks: ReadonlyArray<T>, movedId: number, toIndex: number): Array<T> {
  const moved = blocks.find((block) => block.id === movedId);
  if (!moved) {
    return [...blocks];
  }
  const others = blocks.filter((block) => block !== moved);
  others.splice(Math.max(0, Math.min(toIndex, others.length)), 0, moved);
  return others;
}

export function blockTitle(block: Pick<Block, 'title'>): string {
  return block.title?.trim() || 'Untitled block';
}
