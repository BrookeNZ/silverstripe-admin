/**
 * Dragging in the block list, whose rows differ wildly in height (an expanded block is several times
 * taller than a collapsed one). A row above the dragged block's own slot is compared by its top edge and a
 * row below by its bottom edge, so the dragged block takes a row's place once it sits where that row would
 * leave it a slot: halfway past a short row, halfway past a tall one.
 *
 * The keyboard steps one row per arrow key by list order rather than by distance, lining the block's top
 * up with a row above and its bottom with a row below, which is where closestEdge finds that row.
 * sortableKeyboardCoordinates measures distance instead, so a tall block moving up skipped the row next to
 * it, and with top edges alone a block moving down past a tall row went on to the row after it
 */
import type { ClientRect, CollisionDetection, KeyboardCoordinateGetter, UniqueIdentifier } from '@dnd-kit/core';

export const closestEdge: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers }) => {
  const home = droppableRects.get(active.id);
  return droppableContainers
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      if (!rect) {
        return [];
      }
      const below = home !== undefined && rect.top > home.top;
      const value = below ? Math.abs(rect.bottom - collisionRect.bottom) : Math.abs(rect.top - collisionRect.top);
      return [{ id: container.id, data: { droppableContainer: container, value } }];
    })
    .sort((a, b) => a.data.value - b.data.value);
};

const steps: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

export const stepByRow: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
  const step = steps[event.code];
  if (step === undefined) {
    return undefined;
  }
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  const home = droppableRects.get(active);
  if (!collisionRect || !home) {
    return undefined;
  }
  const rows = droppableContainers
    .getEnabled()
    .flatMap((container): Array<{ id: UniqueIdentifier; rect: ClientRect }> => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  const current = rows.findIndex((row) => row.id === (over?.id ?? active));
  const target = rows[current + step];
  if (current < 0 || !target) {
    return undefined;
  }
  const top = target.rect.top > home.top ? target.rect.bottom - collisionRect.height : target.rect.top;
  return { x: currentCoordinates.x, y: currentCoordinates.y + top - collisionRect.top };
};
