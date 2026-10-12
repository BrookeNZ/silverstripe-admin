import type { Active, ClientRect, DroppableContainer, SensorContext, UniqueIdentifier } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import { closestEdge, stepByRow } from './collision';

function rect(top: number, height: number): ClientRect {
  return { top, bottom: top + height, height, left: 0, right: 600, width: 600 };
}

/**
 * Lays rows out top to bottom with the given heights, drags `activeId` by keyboard and reports the row the
 * block is over after each key, as dnd-kit would: the sensor's coordinates are the dragged block's top left
 */
function keyboardDrag(heights: Record<number, number>, activeId: number, keys: Array<string>): Array<UniqueIdentifier | undefined> {
  const ids = Object.keys(heights).map(Number);
  const rects = new Map<UniqueIdentifier, ClientRect>();
  let top = 0;
  for (const id of ids) {
    rects.set(id, rect(top, heights[id]));
    top += heights[id];
  }
  const containers = ids.map((id) => ({ id, disabled: false }) as unknown as DroppableContainer);
  const droppableContainers = Object.assign([...containers], {
    getEnabled: () => containers,
    get: (id: UniqueIdentifier) => containers.find((container) => container.id === id),
  });
  const home = rects.get(activeId) as ClientRect;
  const active = { id: activeId } as unknown as Active;
  let coordinates = { x: home.left, y: home.top };
  let over: UniqueIdentifier | undefined = activeId;
  const visited: Array<UniqueIdentifier | undefined> = [];
  for (const key of keys) {
    const collisionRect = rect(coordinates.y, home.height);
    const context = {
      active,
      collisionRect,
      droppableRects: rects,
      droppableContainers,
      over: over === undefined ? null : { id: over },
    } as unknown as SensorContext;
    const next = stepByRow({ code: key, preventDefault: () => undefined } as unknown as KeyboardEvent, {
      active: activeId,
      currentCoordinates: coordinates,
      context,
    });
    if (next) {
      coordinates = next;
    }
    const collisions = closestEdge({
      active,
      collisionRect: rect(coordinates.y, home.height),
      droppableRects: rects,
      droppableContainers: containers,
      pointerCoordinates: null,
    });
    over = collisions[0]?.id;
    visited.push(over);
  }
  return visited;
}

describe('stepByRow with closestEdge', () => {
  it('moves one row per arrow key past an expanded block below', () => {
    expect(keyboardDrag({ 1: 100, 2: 726, 3: 100 }, 1, ['ArrowDown', 'ArrowDown'])).toEqual([2, 3]);
  });

  it('moves one row per arrow key past an expanded block above', () => {
    expect(keyboardDrag({ 1: 100, 2: 726, 3: 100 }, 3, ['ArrowUp', 'ArrowUp'])).toEqual([2, 1]);
  });

  it('moves the expanded block itself one row per key', () => {
    expect(keyboardDrag({ 1: 100, 2: 726, 3: 100, 4: 100 }, 2, ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp'])).toEqual([
      3, 4, 3, 2, 1,
    ]);
  });

  it('steps through rows of equal height one at a time', () => {
    expect(keyboardDrag({ 1: 100, 2: 100, 3: 100, 4: 100 }, 1, ['ArrowDown', 'ArrowDown', 'ArrowDown'])).toEqual([2, 3, 4]);
  });

  it('stays put at either end', () => {
    expect(keyboardDrag({ 1: 100, 2: 726 }, 1, ['ArrowUp', 'ArrowDown', 'ArrowDown'])).toEqual([1, 2, 2]);
  });

  it('ignores keys other than up and down', () => {
    expect(keyboardDrag({ 1: 100, 2: 100 }, 1, ['ArrowRight', 'ArrowLeft'])).toEqual([1, 1]);
  });
});

describe('closestEdge', () => {
  it('takes a row below once a pointer drag passes half of it', () => {
    const rects = new Map<UniqueIdentifier, ClientRect>([
      [1, rect(0, 100)],
      [2, rect(100, 726)],
      [3, rect(826, 100)],
    ]);
    const containers = [1, 2, 3].map((id) => ({ id }) as unknown as DroppableContainer);
    const overAt = (offset: number) =>
      closestEdge({
        active: { id: 1 } as unknown as Active,
        collisionRect: rect(offset, 100),
        droppableRects: rects,
        droppableContainers: containers,
        pointerCoordinates: null,
      })[0]?.id;
    expect(overAt(300)).toBe(1);
    expect(overAt(400)).toBe(2);
    expect(overAt(780)).toBe(3);
  });
});
