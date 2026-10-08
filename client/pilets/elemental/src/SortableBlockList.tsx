/**
 * The block list as a dnd-kit sortable: a drag handle per row for pointer and keyboard, rows stepped by
 * edge rather than centre, and spoken announcements naming the block and its position.
 */
import * as React from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Block } from './api';
import { handleId } from './BlockRow';
import { closestEdge, stepByRow } from './collision';

export interface SortableBlockListProps {
  blocks: Array<Block>;
  label: string;
  blockName(block: Block): string;
  /** Called when a block is dropped somewhere new, with the id of the control to focus afterwards */
  onMove(block: Block, toIndex: number, focusId: string): void;
  renderRow(block: Block, index: number): React.ReactNode;
}

export const SortableBlockList = ({ blocks, label, blockName, onMove, renderRow }: SortableBlockListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: stepByRow }),
  );
  // dnd-kit may call these handlers after a later render, so they read the latest list
  const latest = React.useRef(blocks);
  latest.current = blocks;

  const titleOf = (id: number | string) => {
    const block = latest.current.find((candidate) => candidate.id === id);
    return block ? blockName(block) : 'block';
  };
  const positionOf = (id: number | string | undefined) =>
    `${latest.current.findIndex((candidate) => candidate.id === id) + 1} of ${latest.current.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)}`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over position ${positionOf(over.id)}` : `${titleOf(active.id)} is not over a position`),
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)}` : `${titleOf(active.id)} dropped`),
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const block = latest.current.find((candidate) => candidate.id === active.id);
    const toIndex = latest.current.findIndex((candidate) => candidate.id === over?.id);
    if (!block || toIndex < 0 || over?.id === active.id) {
      return;
    }
    onMove(block, toIndex, handleId(block));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestEdge}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move a block, press Space or Enter on its reorder button, use the arrow keys, then press Space or Enter to drop it, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
        <ol className="elemental-area__list" aria-label={label}>
          {blocks.map(renderRow)}
        </ol>
      </SortableContext>
    </DndContext>
  );
};
