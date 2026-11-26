/* eslint-disable max-classes-per-file */
/**
 * The drag and drop layer of the tree view. The member drags the link of an item with the mouse or by touch. The member
 * drops the item before, inside or after the row of another item. Each shown link is a draggable and a droppable,
 * measured as its whole row. The failed, too-many and loading rows are neither. The legacy jstree has no touch drag.
 *
 * The third of the target row under the pointer gives the position. The top third is before, the middle third is
 * inside and the bottom third is after. When the tree or `canDrop` refuses that position, the layer tries the other
 * positions in the order of `dnd_show()` in the legacy jstree. A drop inside the parent of the item tries no other
 * position.
 *
 * Move in the context menu of an item starts a keyboard move, which this layer runs outside dnd-kit. The arrow keys
 * step through the places that the tree and `canDrop` allow, and the marker shows the place. A keyboard move has no
 * overlay.
 *
 * A move does not change the tree. The host reloads the tree when the move is done.
 *
 * A live region of the tree announces the pick-up, each new position, the drop and a cancel by the titles of the
 * items. The legacy jstree announces nothing.
 *
 * The layer finds the move on each pointer move, and a marker in the `nav` shows it. The layer also finds the move
 * again when the rows move under a still pointer. The drop keeps the target and the position of the marker, and finds
 * the order of the siblings again. An overlay shows the icon, the title and the badges of the item, as the helper of
 * the legacy jstree does. The overlay looks the same whether the tree allows the drop or not, as the legacy helper
 * does.
 *
 * A pointer that stays on the row of a collapsed parent for 500 ms expands that parent, as in the legacy jstree. The
 * legacy jstree also expands a parent that refuses the drop, so this layer does not ask `canDrop`.
 */
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import i18n from 'i18n';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { collapseItem, expandItem, trackMoveRequest } from './TreeViewActions';
import { STATUS, TOP_LEVEL_ID } from './TreeViewConstants';
import { getStoredAncestorIds, isItemShown, isMovePending, isParentItem } from './TreeViewSelectors';
import TreeViewStatusBadges from './TreeViewStatusBadges';
import { useTreeValue } from './treeViewStore';
import { getVisibleRows, readFocusKey } from './TreeViewFocus';
import { getScrollContainer } from './treeViewUtils';

const BEFORE = 'before';
const INSIDE = 'inside';
const AFTER = 'after';

// The legacy jstree starts a drag after 5px of movement.
const MOUSE_ACTIVATION_DISTANCE = 5;

// A touch starts a drag after a hold of 250 ms. A touch that moves more than 5px before then is a swipe, which
// scrolls the tree.
const TOUCH_ACTIVATION_CONSTRAINT = { delay: 250, tolerance: 5 };

// Chrome sends the click 5 to 12 ms after the finger lifts. The timeout leaves a wide margin for a slow device.
const TOUCH_RELEASE_CLICK_TIMEOUT = 1000;

// The stop of the click after a touch drag waits at most this long for the lift of a finger. The listeners can miss
// the lift, for example when a reload removes the touched link before the finger lifts.
const TOUCH_LIFT_WAIT_LIMIT = 10000;

// The legacy jstree expands a collapsed parent after the pointer stays on its row for 500 ms.
const EXPAND_DELAY = 500;

// The legacy jstree scrolls its container while the pointer is within 24px of an edge.
const AUTO_SCROLL_EDGE = 24;

// The legacy jstree shows its helper 5px to the right of the pointer and 10px below it.
const OVERLAY_POINTER_OFFSET = { x: 5, y: 10 };

const KEYBOARD_STEP_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
const KEYBOARD_EXPAND_KEYS = ['ArrowRight', 'ArrowLeft'];

// `MouseSensor` starts a drag on every button but the right button. The tree starts a drag only on the main button, as
// the legacy jstree does, and not while a move is pending. A drag would block the `contextmenu` event. Ctrl+click on
// macOS starts no drag, so the `contextmenu` event still fires.
class TreeViewMouseSensor extends MouseSensor {}

TreeViewMouseSensor.activators = [{
  eventName: 'onMouseDown',
  handler: (event, options, context) => {
    if (event.nativeEvent.button !== 0 || event.nativeEvent.ctrlKey) {
      return false;
    }
    // The press leaves focus where it is, as in the legacy jstree. The pressed link then shows no handle or focus ring.
    event.preventDefault();
    return !options.isDragBlocked() && MouseSensor.activators[0].handler(event, options, context);
  },
}];

// A touch starts a drag only with one finger, and not while a move is pending or a keyboard move is in progress. A
// keyboard move blocks a mouse press in its own listener. The same block on a touch would also stop the touch from
// scrolling the tree.
class TreeViewTouchSensor extends TouchSensor {}

TreeViewTouchSensor.activators = [{
  eventName: 'onTouchStart',
  handler: (event, options, context) => (
    !options.isDragBlocked() && TouchSensor.activators[0].handler(event, options, context)
  ),
}];

function isTouchDrag(activatorEvent) {
  return Boolean(activatorEvent) && activatorEvent.type === 'touchstart';
}

// Add the height of the pointer in the row to each collision of `pointerWithin`. The height is 0 at the top and 1 at
// the bottom. `pointerWithin` includes both edges of a row, so a pointer on the bottom edge belongs to the next row.
function detectRowCollisions(args) {
  const { droppableRects, pointerCoordinates } = args;
  return pointerWithin(args)
    .map((collision) => {
      const rect = droppableRects.get(collision.id);
      return { ...collision, data: { ...collision.data, rowOffset: (pointerCoordinates.y - rect.top) / rect.height } };
    })
    .filter((collision) => collision.data.rowOffset < 1);
}

// Measure the row of the link `link`: the line of its item without the group of its children, across the width of the
// tree. The rows meet, so a pointer in the gap between two links is still over a row. The legacy jstree also targets
// rows.
function measureRow(link) {
  const itemRect = link.parentElement.getBoundingClientRect();
  const group = link.nextElementSibling;
  const bottom = group ? group.getBoundingClientRect().top : itemRect.bottom;
  const treeRect = link.closest('.tree-view').getBoundingClientRect();
  return {
    top: itemRect.top,
    bottom,
    height: bottom - itemRect.top,
    left: treeRect.left,
    right: treeRect.right,
    width: treeRect.width,
  };
}

const MEASURING = { droppable: { measure: measureRow } };

// Get the row of an item at the point `x`, `y`, as a collision of `detectRowCollisions()`, or null.
// The too-many and failed rows are not rows of an item.
function findRowAtPoint(nav, x, y) {
  const links = [...nav.querySelectorAll('.tree-view__link[data-focus-key]')];
  for (let index = 0; index < links.length; index += 1) {
    const id = readFocusKey(links[index]);
    const rect = typeof id === 'number' && measureRow(links[index]);
    if (rect && y >= rect.top && y < rect.bottom && x >= rect.left && x <= rect.right) {
      return { id, data: { rowOffset: (y - rect.top) / rect.height } };
    }
  }
  return null;
}

// Get the positions to try for the pointer height `rowOffset`, in the order of `dnd_show()` in the legacy jstree.
function getPositionOrder(rowOffset) {
  if (rowOffset < 1 / 3) {
    return [BEFORE, INSIDE, AFTER];
  }
  if (rowOffset <= 2 / 3) {
    return rowOffset < 1 / 2 ? [INSIDE, BEFORE, AFTER] : [INSIDE, AFTER, BEFORE];
  }
  return [AFTER, INSIDE, BEFORE];
}

/**
 * Get the move of the item `itemId` to `position` at the item `targetId`, as `onMove` gets it.
 *
 * Return null when the tree refuses the move, as the legacy jstree does. The tree refuses a drop on the item or in its
 * branch. It also refuses a drop that leaves the item where it is.
 */
function getMove(tree, itemId, targetId, position) {
  const targetAncestorIds = getStoredAncestorIds(tree, targetId);
  if (targetId === itemId || !targetAncestorIds || targetAncestorIds.includes(itemId)) {
    return null;
  }
  const targetItem = tree.items[targetId];
  const parentId = position === INSIDE ? targetId : targetItem.parentId;
  // The tree shows no children of a limited item, so their order is not known.
  const childIds = position === INSIDE && targetItem.limited ? null : tree.childIds[parentId];
  if (!childIds) {
    return { parentId, position, targetId, siblingIds: null };
  }
  const otherIds = childIds.filter((id) => id !== itemId);
  const index = position === INSIDE ? otherIds.length : otherIds.indexOf(targetId) + (position === AFTER ? 1 : 0);
  const siblingIds = [...otherIds.slice(0, index), itemId, ...otherIds.slice(index)];
  const isSamePlace = siblingIds.length === childIds.length && siblingIds.every((id, i) => id === childIds[i]);
  return isSamePlace ? null : { parentId, position, targetId, siblingIds };
}

// Check whether `canDrop` allows the move `move` of the item `itemId`. A null move is not allowed.
function isMoveAllowed(tree, itemId, move, canDrop) {
  return Boolean(move) && (!canDrop || canDrop(tree.items[itemId], {
    parentId: move.parentId,
    position: move.position,
    targetItem: tree.items[move.targetId],
  }));
}

/**
 * Get the first move at the row `collision` that the tree and `canDrop` allow, or null.
 *
 * A drop inside the parent of the item moves the item to the last place, with no fallback. The fallback would move
 * the item before or after its parent, one level up.
 */
function findMove(tree, itemId, collision, canDrop) {
  const item = tree.items[itemId];
  if (!collision || !item || !tree.items[collision.id]) {
    return null;
  }
  const isAllowed = (move) => isMoveAllowed(tree, itemId, move, canDrop);
  const positions = getPositionOrder(collision.data.rowOffset);
  if (positions[0] === INSIDE && collision.id === item.parentId) {
    const move = getMove(tree, itemId, collision.id, INSIDE);
    return isAllowed(move) ? move : null;
  }
  const moves = positions.map((position) => getMove(tree, itemId, collision.id, position));
  return moves.find(isAllowed) || null;
}

/**
 * Get the positions a keyboard move steps through, top to bottom, as `{ targetId, position }`.
 *
 * Each row of an item gives before, then inside when the row shows no children, then after. The after of a row that
 * shows its children comes after the rows of those children, where `getMove()` puts the item. The tree and `canDrop`
 * can still refuse a position.
 */
function getKeyboardPositions(tree) {
  const rows = getVisibleRows(tree).filter((row) => typeof row.key === 'number');
  const positions = [];
  const openParentIds = [];
  rows.forEach(({ key, parentId }, index) => {
    while (openParentIds.length && openParentIds[openParentIds.length - 1] !== parentId) {
      positions.push({ targetId: openParentIds.pop(), position: AFTER });
    }
    positions.push({ targetId: key, position: BEFORE });
    const nextRow = rows[index + 1];
    if (nextRow && nextRow.parentId === key) {
      openParentIds.push(key);
    } else {
      positions.push({ targetId: key, position: INSIDE }, { targetId: key, position: AFTER });
    }
  });
  while (openParentIds.length) {
    positions.push({ targetId: openParentIds.pop(), position: AFTER });
  }
  return positions;
}

// Get the key of the place where `move` puts the item, from its new parent and `siblingIds`.
// Two positions with the same key are one place.
function getPlaceKey(move) {
  return `${move.parentId}:${move.siblingIds ? move.siblingIds.join(',') : 'last'}`;
}

/**
 * Find the first move that the tree and `canDrop` allow, from `positions[from]` in the direction `step`. Skip a move to
 * the place `skipKey`. Return `{ index, move }`, or null.
 *
 * The search asks `canDrop` only about the positions it passes, not about every row.
 */
function findKeyboardMove(tree, itemId, positions, { from, step, skipKey = null, canDrop }) {
  for (let index = from; index >= 0 && index < positions.length; index += step) {
    const { targetId, position } = positions[index];
    const move = getMove(tree, itemId, targetId, position);
    if (isMoveAllowed(tree, itemId, move, canDrop) && getPlaceKey(move) !== skipKey) {
      return { index, move };
    }
  }
  return null;
}

// Go back from the result `found` of `findKeyboardMove()` to the first position of its place. Up and Down then mark a
// place at the same position.
function findFirstPositionOfPlace(tree, itemId, positions, found, canDrop) {
  let first = found;
  for (;;) {
    const previous = findKeyboardMove(tree, itemId, positions, { from: first.index - 1, step: -1, canDrop });
    if (!previous || getPlaceKey(previous.move) !== getPlaceKey(first.move)) {
      return first;
    }
    first = previous;
  }
}

/**
 * Get the index in `positions` of the marked move `markedMove`, or -1.
 *
 * A pointer, a toggle or a reload can mark a position that is not in `positions`, such as inside an expanded parent.
 * The function then returns the index of the first position of the same place.
 */
function findMarkedIndex(tree, itemId, positions, markedMove) {
  const index = positions.findIndex(
    (entry) => entry.targetId === markedMove.targetId && entry.position === markedMove.position,
  );
  if (index !== -1) {
    return index;
  }
  const placeKey = getPlaceKey(markedMove);
  return positions.findIndex(({ targetId, position }) => {
    const move = getMove(tree, itemId, targetId, position);
    return Boolean(move) && getPlaceKey(move) === placeKey;
  });
}

/**
 * Get the move that the key `key` marks from `markedMove`, or undefined when the key marks no new move.
 *
 * With no marked move, Up and Down start from the place of the item.
 */
function findSteppedMove(tree, itemId, markedMove, key, canDrop) {
  const positions = getKeyboardPositions(tree);
  const last = positions.length - 1;
  const ownIndex = positions.findIndex((entry) => entry.targetId === itemId && entry.position === BEFORE);
  const markedIndex = markedMove ? findMarkedIndex(tree, itemId, positions, markedMove) : -1;
  const index = markedIndex === -1 ? ownIndex : markedIndex;
  const skipKey = markedIndex === -1 ? null : getPlaceKey(markedMove);
  const searches = {
    ArrowDown: { from: markedIndex === -1 ? index : index + 1, step: 1, skipKey },
    ArrowUp: { from: index - 1, step: -1, skipKey },
    Home: { from: 0, step: 1 },
    End: { from: last, step: -1 },
  };
  const found = findKeyboardMove(tree, itemId, positions, { ...searches[key], canDrop });
  if (!found) {
    return undefined;
  }
  return searches[key].step === 1 ? found.move : findFirstPositionOfPlace(tree, itemId, positions, found, canDrop).move;
}

// Get the first move inside the parent `parentId` that the tree and `canDrop` allow, or null. The search covers only
// the positions at the rows of the children.
function findFirstMoveInside(tree, itemId, parentId, canDrop) {
  const positions = getKeyboardPositions(tree);
  const from = positions.findIndex((entry) => entry.targetId === parentId && entry.position === BEFORE);
  for (let index = from + 1; from !== -1 && index < positions.length; index += 1) {
    const { targetId, position } = positions[index];
    if (targetId === parentId) {
      return null;
    }
    const move = getMove(tree, itemId, targetId, position);
    if (move && move.parentId === parentId && isMoveAllowed(tree, itemId, move, canDrop)) {
      return move;
    }
  }
  return null;
}

// Get the id of the item that a pointer at the row `collision` expands after a wait, or null. The row must be the row
// of a collapsed parent, and the parent must not be the dragged item `itemId`.
function getItemToExpand(tree, itemId, collision) {
  if (!collision || collision.id === itemId) {
    return null;
  }
  const targetItem = tree.items[collision.id];
  if (!targetItem || tree.expanded.includes(collision.id)) {
    return null;
  }
  return isParentItem(targetItem, tree.childIds[collision.id], false) ? collision.id : null;
}

function clearExpandTimer(expandTimerRef) {
  clearTimeout(expandTimerRef.current.timeoutId);
  expandTimerRef.current = { itemId: null, timeoutId: null };
}

/**
 * Get the `autoScroll` setting of `DndContext` for a drag in the tree of the `nav`.
 *
 * dnd-kit takes the edge as a fraction of the size of each scroll container. This function gives a fraction of the
 * container of the tree, so that the edge is `AUTO_SCROLL_EDGE` wide there. A container without a size keeps the
 * default edge.
 */
function getAutoScroll(nav) {
  const { clientWidth, clientHeight } = getScrollContainer(nav);
  if (!clientWidth || !clientHeight) {
    return true;
  }
  return { threshold: { x: AUTO_SCROLL_EDGE / clientWidth, y: AUTO_SCROLL_EDGE / clientHeight } };
}

/**
 * Measure the rows again after the shown rows change during a drag, then call `onMeasure` as a pointer move does.
 *
 * dnd-kit measures the rows again only when a droppable mounts or unmounts. The loading, failed and too-many rows are
 * not droppables, but they move the rows below them. After a measure, a still pointer can be over another row, or over
 * the same row in another place.
 */
function TreeViewDragMeasure({ store, onMeasure }) {
  const { active, collisions, droppableRects, measureDroppableContainers } = useDndContext();
  const childIds = useTreeValue(store, (tree) => tree.childIds);
  const status = useTreeValue(store, (tree) => tree.status);
  const expanded = useTreeValue(store, (tree) => tree.expanded);
  const latestRef = useRef(null);
  latestRef.current = { active, collisions, onMeasure };

  // `measureDroppableContainers()` does nothing while no drag is active.
  useEffect(() => {
    measureDroppableContainers();
  }, [measureDroppableContainers, childIds, status, expanded]);

  // dnd-kit gives a new `droppableRects` map only after a measure.
  useEffect(() => {
    const latest = latestRef.current;
    if (latest.active) {
      latest.onMeasure({ active: latest.active, collisions: latest.collisions });
    }
  }, [droppableRects]);
  return null;
}

TreeViewDragMeasure.propTypes = {
  store: PropTypes.object.isRequired,
  onMeasure: PropTypes.func.isRequired,
};

// Check whether two results of `findMove()` mark the same position at the same target.
function isSameMove(move, otherMove) {
  if (!move || !otherMove) {
    return move === otherMove;
  }
  return move.targetId === otherMove.targetId && move.position === otherMove.position;
}

// Check whether two results of `getMarkerOffset()` are the same offset.
function isSameMarkerOffset(offset, otherOffset) {
  if (!offset || !otherOffset) {
    return offset === otherOffset;
  }
  return offset.top === otherOffset.top && offset.left === otherOffset.left;
}

/**
 * Get the top left of the target row of `move`, from the top left of the `nav`. The marker goes there.
 * TreeView.scss moves the marker from there to the edge or the middle of the row.
 *
 * When the arrow keys mark the move, the marker after an expanded parent goes below the last row of the branch of the
 * parent. A drag and a pointer after Move put that marker below the row of the parent, as the legacy jstree does.
 */
function getMarkerOffset(nav, move, isKeyboardMarker) {
  const link = nav.querySelector(`[data-focus-key="${move.targetId}"]`);
  if (!link) {
    return null;
  }
  const navRect = nav.getBoundingClientRect();
  const itemRect = link.parentElement.getBoundingClientRect();
  const left = itemRect.left - navRect.left;
  const group = link.nextElementSibling;
  if (isKeyboardMarker && move.position === AFTER && group) {
    const rowHeight = group.getBoundingClientRect().top - itemRect.top;
    return { top: itemRect.bottom - navRect.top - rowHeight, left };
  }
  return { top: itemRect.top - navRect.top, left };
}

// Get the row that shows the marker of a keyboard move at `move`. After an expanded parent, that row is the last row
// of the branch.
function getKeyboardMarkerRow(nav, move) {
  const link = nav.querySelector(`[data-focus-key="${move.targetId}"]`);
  const group = link && link.nextElementSibling;
  if (move.position !== AFTER || !group) {
    return link;
  }
  const rows = group.querySelectorAll('[data-focus-key], .tree-view__item--loading');
  return rows.length ? rows[rows.length - 1] : link;
}

// Move the overlay from the place of the dragged link to the pointer.
function placeOverlayAtPointer({ activatorEvent, activeNodeRect, transform }) {
  if (!activatorEvent || !activeNodeRect) {
    return transform;
  }
  const point = isTouchDrag(activatorEvent) ? activatorEvent.touches[0] : activatorEvent;
  return {
    ...transform,
    x: transform.x + point.clientX - activeNodeRect.left + OVERLAY_POINTER_OFFSET.x,
    y: transform.y + point.clientY - activeNodeRect.top + OVERLAY_POINTER_OFFSET.y,
  };
}

const OVERLAY_MODIFIERS = [placeOverlayAtPointer];

// Stop the click that follows the release of a drag. The click would open the item, and the browser would follow the
// link.
function preventReleaseClick() {
  const preventClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', preventClick, { capture: true });
  setTimeout(() => window.removeEventListener('click', preventClick, { capture: true }), 0);
}

/**
 * Stop the click in the `nav` that can follow the release of a touch drag. Return the `AbortController` that ends the
 * stop.
 *
 * The browser can send that click later than the 0 ms timeout of `preventReleaseClick`, and sends no click when the
 * finger moved. The stop ends at the first click, at the next press of a pointer, or `TOUCH_RELEASE_CLICK_TIMEOUT`
 * after the finger lifts. A press of a key ends the stop only after the finger lifts, because Escape cancels a drag
 * while the finger is still down. With no lift, the stop ends after `TOUCH_LIFT_WAIT_LIMIT`.
 */
function createTouchReleaseClickStop(nav, isFingerDown) {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  const stopPreventing = () => controller.abort();
  let isWaitingForLift = isFingerDown;
  let timeoutId = null;
  const startTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(stopPreventing, TOUCH_RELEASE_CLICK_TIMEOUT);
  };
  if (isFingerDown) {
    timeoutId = setTimeout(stopPreventing, TOUCH_LIFT_WAIT_LIMIT);
  } else {
    startTimeout();
  }
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId));
  window.addEventListener('click', (event) => {
    if (nav.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
    stopPreventing();
  }, options);
  window.addEventListener('pointerdown', stopPreventing, options);
  window.addEventListener('keydown', () => !isWaitingForLift && stopPreventing(), options);
  // A new tap ends the stop with its `pointerdown` before its `touchend`.
  const handleLift = () => {
    isWaitingForLift = false;
    startTimeout();
  };
  window.addEventListener('touchend', handleLift, options);
  window.addEventListener('touchcancel', handleLift, options);
  return controller;
}

function getPositionText(position, title) {
  const texts = {
    [BEFORE]: i18n._t('Admin.TREEVIEW_DRAG_BEFORE', 'Before {title}'),
    [INSIDE]: i18n._t('Admin.TREEVIEW_DRAG_INSIDE', 'Inside {title}'),
    [AFTER]: i18n._t('Admin.TREEVIEW_DRAG_AFTER', 'After {title}'),
  };
  return i18n.inject(texts[position], { title });
}

function getDropText(position, title, targetTitle) {
  const texts = {
    [BEFORE]: i18n._t('Admin.TREEVIEW_DROPPED_BEFORE', 'Dropped {title} before {target}'),
    [INSIDE]: i18n._t('Admin.TREEVIEW_DROPPED_INSIDE', 'Dropped {title} inside {target}'),
    [AFTER]: i18n._t('Admin.TREEVIEW_DROPPED_AFTER', 'Dropped {title} after {target}'),
  };
  return i18n.inject(texts[position], { title, target: targetTitle });
}

function getCancelText(title) {
  return i18n.inject(i18n._t('Admin.TREEVIEW_DRAG_CANCELLED', 'Cancelled the move of {title}'), { title });
}

// dnd-kit announces nothing when a callback returns `undefined`. The tree announces a move in its own live region.
const SILENT_ANNOUNCEMENTS = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

// Get the `accessibility` setting of `DndContext`. The hidden text of dnd-kit holds the instructions that describe each
// link.
function getAccessibility() {
  return {
    screenReaderInstructions: {
      draggable: i18n._t(
        'Admin.TREEVIEW_DRAG_INSTRUCTIONS',
        'To move an item, drag it with the mouse, or choose Move in its context menu, and drop it before, inside or '
          + 'after another item.',
      ),
    },
    announcements: SILENT_ANNOUNCEMENTS,
  };
}

// Call `onMove` and return its promise. A function that throws gives a rejected promise.
function requestMove(onMove, item, move) {
  try {
    return Promise.resolve(onMove(item, move));
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * The drag and drop context of the items. Without `onMove` it renders only its children.
 */
export function TreeViewDragArea({
  store,
  navRef,
  onMove = null,
  canDrop = null,
  onDragStart,
  onDragEnd,
  onAnnounce,
  keyboardMoveRef,
  children,
}) {
  const isMouseDragBlocked = useCallback(() => isMovePending(store.getState()), [store]);
  // The id of the item of a keyboard move, or null. The listeners of a keyboard move read it before the next render.
  const keyboardItemIdRef = useRef(null);
  // The id of the parent that Right expanded in a keyboard move, until its children show.
  const keyboardExpandIdRef = useRef(null);
  // Whether a pointer marked the place of the keyboard move. The marker then goes where a drag puts it.
  const isMarkedByPointerRef = useRef(false);
  const mouseSensorOptions = useMemo(() => ({
    activationConstraint: { distance: MOUSE_ACTIVATION_DISTANCE },
    isDragBlocked: isMouseDragBlocked,
  }), [isMouseDragBlocked]);
  const isTouchDragBlocked = useCallback(
    () => keyboardItemIdRef.current !== null || isMovePending(store.getState()),
    [store],
  );
  const touchSensorOptions = useMemo(() => ({
    activationConstraint: TOUCH_ACTIVATION_CONSTRAINT,
    isDragBlocked: isTouchDragBlocked,
  }), [isTouchDragBlocked]);
  const sensors = useSensors(
    useSensor(TreeViewMouseSensor, mouseSensorOptions),
    useSensor(TreeViewTouchSensor, touchSensorOptions),
  );
  const [drag, setDrag] = useState(null);
  const moveRef = useRef(null);
  const accessibility = useMemo(getAccessibility, []);
  // The `AbortController` that ends the stop of the click after a touch drag.
  const touchReleaseClickStopRef = useRef(null);
  // Whether a finger is on the tree. The stop of the click waits for the lift when Escape cancels a touch drag with the
  // finger still down.
  const isFingerDownRef = useRef(false);
  const expandTimerRef = useRef({ itemId: null, timeoutId: null });
  const isDragActive = Boolean(onMove) && drag !== null;
  const keyboardItemId = isDragActive && drag.isKeyboard ? drag.item.id : null;
  // The rows can move or go on any change of the state.
  const keyboardMoveTree = useTreeValue(store, (tree) => (keyboardItemId === null ? null : tree));
  // The handlers of the latest render, which the listeners of a keyboard move and `keyboardMoveRef` call.
  const keyboardHandlersRef = useRef(null);

  // The drag also ends when the area unmounts or `onMove` goes away. The mouse sensor still ends the drag on the
  // release, so the move is cleared here. The release then calls no `onMove`.
  useEffect(() => {
    if (!isDragActive) {
      return undefined;
    }
    // The timer of the expand of a parent also stops here, after a drop or a cancel.
    return () => {
      const itemId = keyboardItemIdRef.current;
      moveRef.current = null;
      keyboardItemIdRef.current = null;
      clearExpandTimer(expandTimerRef);
      setDrag(null);
      onDragEnd();
      if (itemId !== null) {
        const item = store.getState().items[itemId];
        onAnnounce(getCancelText(item ? item.treeTitle : ''));
      }
    };
  }, [isDragActive, onDragEnd, onAnnounce, store]);

  useEffect(() => () => touchReleaseClickStopRef.current?.abort(), []);

  // The listeners capture the touch events, so they run before the listeners of `TouchSensor` on the link.
  useEffect(() => {
    const nav = navRef.current;
    const handleTouch = (event) => {
      isFingerDownRef.current = event.type === 'touchstart';
    };
    const types = ['touchstart', 'touchend', 'touchcancel'];
    types.forEach((type) => nav.addEventListener(type, handleTouch, true));
    return () => types.forEach((type) => nav.removeEventListener(type, handleTouch, true));
  }, [navRef]);

  useImperativeHandle(keyboardMoveRef, () => ({
    start: (item) => keyboardHandlersRef.current && keyboardHandlersRef.current.start(item),
  }), []);

  // Focus stays on the link of the item for the whole keyboard move. The menu returns focus to the link before this
  // effect runs.
  useEffect(() => {
    if (keyboardItemId === null) {
      return undefined;
    }
    const nav = navRef.current;
    const scrollContainer = getScrollContainer(nav);
    // A reload can mount the row of the item again, with a new link.
    const getLink = () => nav.querySelector(`[data-focus-key="${keyboardItemId}"]`);
    // The handlers are null after a render without `onMove`, until this effect cleans up.
    const handleKeyDown = (event) => {
      if (event.target === getLink()) {
        keyboardHandlersRef.current?.handleKeyDown(event);
      } else {
        keyboardHandlersRef.current?.cancel();
      }
    };
    // A blur of the window leaves focus on the link.
    const handleFocusOut = () => document.activeElement !== getLink() && keyboardHandlersRef.current?.cancel();
    // A press in the tree leaves focus on the link, so that a click on a row can drop there. dnd-kit starts no drag on
    // the prevented press. A press on the scrollbar of the scroll container leaves focus on the link too.
    const handleMouseDown = (event) => {
      if (nav.contains(event.target)) {
        event.preventDefault();
      } else if (event.target !== scrollContainer) {
        keyboardHandlersRef.current?.cancel();
      }
    };
    const handleMouseMove = (event) => keyboardHandlersRef.current?.handlePointer(event, false);
    const handleClick = (event) => keyboardHandlersRef.current?.handlePointer(event, true);
    const link = getLink();
    if (!link || document.activeElement !== link) {
      keyboardHandlersRef.current.cancel();
      return undefined;
    }
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    nav.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      nav.removeEventListener('focusout', handleFocusOut);
    };
  }, [keyboardItemId, navRef]);

  useEffect(() => {
    if (!keyboardMoveTree) {
      return;
    }
    if (isItemShown(keyboardMoveTree, keyboardItemId)) {
      keyboardHandlersRef.current.findMarkedMoveAgain();
    } else {
      keyboardHandlersRef.current.cancel();
    }
  }, [keyboardItemId, keyboardMoveTree]);

  if (!onMove) {
    keyboardHandlersRef.current = null;
    return children;
  }

  const getTitle = (id) => {
    const item = store.getState().items[id];
    return item ? item.treeTitle : '';
  };

  const handleDragStart = ({ active }) => {
    moveRef.current = null;
    onAnnounce(i18n.inject(i18n._t('Admin.TREEVIEW_DRAG_PICKED_UP', 'Picked up {title}'), { title: getTitle(active.id) }));
    setDrag({
      item: store.getState().items[active.id],
      move: null,
      markerOffset: null,
      autoScroll: getAutoScroll(navRef.current),
    });
    onDragStart();
  };

  // The timer starts again only when the pointer reaches another parent to expand.
  const updateExpandTimer = (tree, itemId, collision) => {
    const expandId = getItemToExpand(tree, itemId, collision);
    if (expandId === expandTimerRef.current.itemId) {
      return;
    }
    clearExpandTimer(expandTimerRef);
    if (expandId !== null) {
      const timeoutId = setTimeout(() => expandItem(store, expandId), EXPAND_DELAY);
      expandTimerRef.current = { itemId: expandId, timeoutId };
    }
  };

  // Mark the move `move` with the marker, and announce its position when the move changes. A null move hides the
  // marker, and announces a refused drop when `shouldAnnounceRefusal` is true. The default is true only outside a
  // keyboard move.
  const markMove = (move, shouldAnnounceRefusal = keyboardItemIdRef.current === null) => {
    const isKeyboardMarker = keyboardItemIdRef.current !== null && !isMarkedByPointerRef.current;
    const markerOffset = move && getMarkerOffset(navRef.current, move, isKeyboardMarker);
    const isMoveChanged = !isSameMove(move, moveRef.current);
    if (!isMoveChanged && isSameMarkerOffset(markerOffset, drag && drag.markerOffset)) {
      return;
    }
    moveRef.current = move;
    setDrag((current) => current && { ...current, move, markerOffset });
    if (isMoveChanged && (move || shouldAnnounceRefusal)) {
      onAnnounce(move
        ? getPositionText(move.position, getTitle(move.targetId))
        : i18n._t('Admin.TREEVIEW_DRAG_REFUSED', 'Cannot drop here'));
    }
  };

  // dnd-kit calls this handler on each pointer move. `TreeViewDragMeasure` also calls it when the rows move under a
  // still pointer.
  const handleDragMove = ({ active, collisions }) => {
    const tree = store.getState();
    const collision = collisions && collisions[0];
    updateExpandTimer(tree, active.id, collision);
    markMove(findMove(tree, active.id, collision, canDrop));
  };

  const preventTouchReleaseClick = () => {
    touchReleaseClickStopRef.current?.abort();
    touchReleaseClickStopRef.current = createTouchReleaseClickStop(navRef.current, isFingerDownRef.current);
  };

  // Escape cancels the drag while the button or the finger is still down. The click after the later release must not
  // open the item.
  const handleDragCancel = ({ active, activatorEvent }) => {
    onAnnounce(getCancelText(getTitle(active.id)));
    setDrag(null);
    if (isTouchDrag(activatorEvent)) {
      preventTouchReleaseClick();
    } else {
      window.addEventListener('mouseup', preventReleaseClick, { capture: true, once: true });
    }
  };

  // Drop the item `itemId` at the marked move. A reload can change the children of the new parent after the marker
  // moved there, so the drop finds the move again.
  const dropMarkedMove = (itemId) => {
    const tree = store.getState();
    const markedMove = moveRef.current;
    const move = markedMove && tree.items[itemId] && getMove(tree, itemId, markedMove.targetId, markedMove.position);
    const isAllowed = isMoveAllowed(tree, itemId, move, canDrop);
    moveRef.current = null;
    setDrag(null);
    if (!isAllowed) {
      onAnnounce(i18n.inject(i18n._t('Admin.TREEVIEW_DROP_REFUSED', 'Cannot drop {title} here'), { title: getTitle(itemId) }));
      return;
    }
    onAnnounce(getDropText(move.position, getTitle(itemId), getTitle(move.targetId)));
    // The drop expands a collapsed target at the end of this function. A cancel or a failure of the move collapses the
    // target again, as the legacy jstree rolls back a cancelled or refused move.
    const isTargetExpandedByDrop = move.position === INSIDE && !tree.expanded.includes(move.targetId);
    const collapseTarget = () => {
      if (isTargetExpandedByDrop) {
        collapseItem(store, move.targetId);
      }
    };
    trackMoveRequest(store, itemId, () => requestMove(onMove, store.getState().items[itemId], move).then(
      (outcome) => {
        if (outcome === false) {
          collapseTarget();
        }
        return outcome;
      },
      (error) => {
        collapseTarget();
        throw error;
      },
    ));
    // The host reloads the tree after the move. An expanded target then loads its new children.
    if (move.position === INSIDE) {
      expandItem(store, move.targetId);
    }
  };

  const handleDragEnd = ({ active, activatorEvent }) => {
    if (isTouchDrag(activatorEvent)) {
      preventTouchReleaseClick();
    } else {
      preventReleaseClick();
    }
    dropMarkedMove(active.id);
  };

  const startKeyboardMove = (item) => {
    if (drag || isMovePending(store.getState())) {
      return;
    }
    moveRef.current = null;
    keyboardItemIdRef.current = item.id;
    keyboardExpandIdRef.current = null;
    isMarkedByPointerRef.current = false;
    onAnnounce(i18n.inject(i18n._t(
      'Admin.TREEVIEW_MOVE_STARTED',
      'Moving {title}. Press the up and down arrows to choose a place, then Enter to drop or Escape to cancel.',
    ), { title: item.treeTitle }));
    setDrag({ item, move: null, markerOffset: null, autoScroll: true, isKeyboard: true });
    onDragStart();
  };

  const cancelKeyboardMove = () => {
    const itemId = keyboardItemIdRef.current;
    if (itemId === null) {
      return;
    }
    keyboardItemIdRef.current = null;
    moveRef.current = null;
    setDrag(null);
    onAnnounce(getCancelText(getTitle(itemId)));
  };

  const markKeyboardMove = (move) => {
    isMarkedByPointerRef.current = false;
    markMove(move);
    const markerRow = move && getKeyboardMarkerRow(navRef.current, move);
    if (markerRow) {
      markerRow.scrollIntoView({ block: 'nearest' });
    }
  };

  const stepKeyboardMove = (key) => {
    const move = findSteppedMove(store.getState(), keyboardItemIdRef.current, moveRef.current, key, canDrop);
    if (move) {
      keyboardExpandIdRef.current = null;
      markKeyboardMove(move);
    }
  };

  // Right on a place inside a collapsed parent expands the parent. The first place inside the parent is marked once
  // its children show. Left on a place at the row of a child collapses the parent of the row and marks the place inside
  // the parent. Left does nothing when the parent holds the item, since the collapse would hide the item.
  const expandOrCollapseKeyboardMove = (key) => {
    const tree = store.getState();
    const itemId = keyboardItemIdRef.current;
    const markedMove = moveRef.current;
    if (!markedMove) {
      return;
    }
    const targetItem = tree.items[markedMove.targetId];
    if (key === 'ArrowRight') {
      const canExpand = markedMove.position === INSIDE && !targetItem.limited
        && !tree.expanded.includes(markedMove.targetId) && isParentItem(targetItem, tree.childIds[markedMove.targetId], false);
      if (canExpand) {
        keyboardExpandIdRef.current = markedMove.targetId;
        expandItem(store, markedMove.targetId);
      }
      return;
    }
    const { parentId } = targetItem;
    const ancestorIds = getStoredAncestorIds(tree, itemId) || [];
    const move = getMove(tree, itemId, parentId, INSIDE);
    if (parentId === TOP_LEVEL_ID || ancestorIds.includes(parentId) || !isMoveAllowed(tree, itemId, move, canDrop)) {
      return;
    }
    keyboardExpandIdRef.current = null;
    collapseItem(store, parentId);
    markKeyboardMove(move);
  };

  // Keep the marked place while the tree and `canDrop` still allow it. The marker follows its row.
  const findMarkedMoveAgain = () => {
    const tree = store.getState();
    const itemId = keyboardItemIdRef.current;
    const expandId = keyboardExpandIdRef.current;
    if (expandId !== null && (tree.childIds[expandId] || tree.status[expandId] === STATUS.FAILED)) {
      keyboardExpandIdRef.current = null;
      const moveInside = findFirstMoveInside(tree, itemId, expandId, canDrop);
      if (moveInside) {
        markKeyboardMove(moveInside);
        return;
      }
    }
    const markedMove = moveRef.current;
    if (!markedMove) {
      return;
    }
    const move = getMove(tree, itemId, markedMove.targetId, markedMove.position);
    markMove(isMoveAllowed(tree, itemId, move, canDrop) ? move : null);
  };

  // Drop the item at the marked place, or cancel the move when no place is marked. Focus stays on the link, so the
  // moved item takes focus after the reload of the move.
  const dropKeyboardMove = () => {
    const itemId = keyboardItemIdRef.current;
    if (!moveRef.current) {
      cancelKeyboardMove();
      return;
    }
    keyboardItemIdRef.current = null;
    dropMarkedMove(itemId);
  };

  // After Move, the marker follows a pointer over the rows of the items as in a drag, and a click on a row drops there.
  // A click on a toggle or elsewhere in the tree acts as usual.
  const handleKeyboardMovePointer = (event, isClick) => {
    const nav = navRef.current;
    const row = nav.contains(event.target) && !event.target.closest('.tree-view__toggle')
      ? findRowAtPoint(nav, event.clientX, event.clientY)
      : null;
    if (!row) {
      return;
    }
    const itemId = keyboardItemIdRef.current;
    keyboardExpandIdRef.current = null;
    isMarkedByPointerRef.current = true;
    markMove(findMove(store.getState(), itemId, row, canDrop), true);
    if (isClick) {
      event.preventDefault();
      event.stopPropagation();
      keyboardItemIdRef.current = null;
      dropMarkedMove(itemId);
    }
  };

  // Tab cancels the move and moves focus as usual. Every other key stops here, so Enter does not follow the link and
  // Shift+F10 opens no menu. A key with Ctrl, Alt or Meta is left to the browser.
  const handleKeyboardMoveKeyDown = (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === 'Tab') {
      cancelKeyboardMove();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      cancelKeyboardMove();
      return;
    }
    // A change of the tree can remove the target of the marked move before `findMarkedMoveAgain()` runs.
    if (moveRef.current && !store.getState().items[moveRef.current.targetId]) {
      return;
    }
    if (KEYBOARD_STEP_KEYS.includes(event.key)) {
      stepKeyboardMove(event.key);
      return;
    }
    if (KEYBOARD_EXPAND_KEYS.includes(event.key)) {
      expandOrCollapseKeyboardMove(event.key);
      return;
    }
    // A held Enter or Space from the menu item that started the move repeats on the link.
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      dropKeyboardMove();
    }
  };

  keyboardHandlersRef.current = {
    start: startKeyboardMove,
    cancel: cancelKeyboardMove,
    findMarkedMoveAgain,
    handlePointer: handleKeyboardMovePointer,
    handleKeyDown: handleKeyboardMoveKeyDown,
  };

  return (
    <DndContext
      sensors={sensors}
      accessibility={accessibility}
      autoScroll={drag ? drag.autoScroll : true}
      measuring={MEASURING}
      collisionDetection={detectRowCollisions}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <TreeViewDragMeasure store={store} onMeasure={handleDragMove} />
      {children}
      {drag && drag.markerOffset && (
        <div
          className={classnames('tree-view__drop-marker', `tree-view__drop-marker--${drag.move.position}`)}
          style={drag.markerOffset}
          aria-hidden="true"
        />
      )}
      {drag && !drag.isKeyboard && drag.item && (
        <DragOverlay dropAnimation={null} modifiers={OVERLAY_MODIFIERS}>
          <div className="tree-view__drag-overlay" aria-hidden="true">
            <span className={classnames('tree-view__icon', drag.item.iconClasses)} />
            {drag.item.treeTitle}
            <TreeViewStatusBadges statusFlags={drag.item.statusFlags} />
          </div>
        </DragOverlay>
      )}
    </DndContext>
  );
}

TreeViewDragArea.propTypes = {
  store: PropTypes.object.isRequired,
  navRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }).isRequired,
  onMove: PropTypes.func,
  canDrop: PropTypes.func,
  onDragStart: PropTypes.func.isRequired,
  onDragEnd: PropTypes.func.isRequired,
  onAnnounce: PropTypes.func.isRequired,
  keyboardMoveRef: PropTypes.shape({ current: PropTypes.object }),
  children: PropTypes.node,
};

// Make the link of the item `id` a draggable and a droppable. Return the ref and the listeners of the link, and the id
// of the drag instructions that describe the link.
export function useItemDrag(id, isDragEnabled) {
  // The other `attributes` of `useDraggable` would replace the `treeitem` role and the `tabindex` of the link, so the
  // link uses only `aria-describedby`.
  const { setNodeRef: setDraggableRef, listeners, attributes } = useDraggable({ id, disabled: !isDragEnabled });
  const { setNodeRef: setDroppableRef } = useDroppable({ id, disabled: !isDragEnabled });
  const setLinkRef = useCallback((node) => {
    setDraggableRef(node);
    setDroppableRef(node);
  }, [setDraggableRef, setDroppableRef]);
  return { setLinkRef, listeners, instructionsId: isDragEnabled ? attributes['aria-describedby'] : undefined };
}
