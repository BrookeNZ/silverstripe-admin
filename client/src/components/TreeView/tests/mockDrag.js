/* global jest */
import { fireEvent } from '@testing-library/react';

const ROW_HEIGHT = 30;
const ROW_WIDTH = 300;
// A link is smaller than its row, as in the browser. A pointer can then be over a row but not over its link.
const LINK_BOX = { top: 3, height: 24, left: 20, width: 100 };
// A loading row takes a line as a link does, but it has no focus key.
const ROW_SELECTOR = '[data-focus-key], .tree-view__item--loading';

function makeRect(top, height, left, width) {
  return { top, bottom: top + height, left, right: left + width, height, width, x: left, y: top, toJSON: () => ({}) };
}

function getRowIndex(row) {
  return [...document.querySelectorAll(ROW_SELECTOR)].indexOf(row);
}

/**
 * Give each row a place in document order, one row below the other, and each link a box inside its row. An item, a
 * group of items and the tree span every row they contain. jsdom gives every element an empty rectangle, so without
 * this stand-in a drag finds no target. Return the spy, which the test restores.
 */
export function mockRowRects() {
  const getEmptyRect = Element.prototype.getBoundingClientRect;
  return jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
    if (this.hasAttribute('data-focus-key')) {
      const top = getRowIndex(this) * ROW_HEIGHT + LINK_BOX.top;
      return makeRect(top, LINK_BOX.height, LINK_BOX.left, LINK_BOX.width);
    }
    const rows = this.matches('.tree-view, .tree-view__item, .tree-view__group')
      ? this.querySelectorAll(ROW_SELECTOR)
      : [];
    if (!rows.length) {
      return getEmptyRect.call(this);
    }
    const firstIndex = getRowIndex(rows[0]);
    const lastIndex = getRowIndex(rows[rows.length - 1]);
    return makeRect(firstIndex * ROW_HEIGHT, (lastIndex - firstIndex + 1) * ROW_HEIGHT, 0, ROW_WIDTH);
  });
}

// Get the point at `rowOffset` of the height of `link`, from 0 at the top to 1 at the bottom.
function getPoint(link, rowOffset) {
  const rect = link.getBoundingClientRect();
  return { clientX: rect.left + 10, clientY: rect.top + rect.height * rowOffset };
}

/**
 * Press a button on `link` and move the pointer past the distance that starts a drag. `MouseSensor` listens for the
 * moves and the release on the document. `init` can change the button and add modifier keys.
 */
export function startDrag(link, init = {}) {
  const start = getPoint(link, 0.5);
  fireEvent.mouseDown(link, { button: 0, ...start, ...init });
  fireEvent.mouseMove(document, { clientX: start.clientX, clientY: start.clientY + 10 });
}

export function moveTo(link, rowOffset = 0.5) {
  fireEvent.mouseMove(document, getPoint(link, rowOffset));
}

export function moveOutside() {
  fireEvent.mouseMove(document, { clientX: ROW_WIDTH * 2, clientY: 0 });
}

export function moveToPoint(clientX, clientY) {
  fireEvent.mouseMove(document, { clientX, clientY });
}

export function release() {
  fireEvent.mouseUp(document);
}

export function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
}

// Drag `link` to `rowOffset` of the height of `targetLink` and release it there.
export function dragTo(link, targetLink, rowOffset = 0.5) {
  startDrag(link);
  moveTo(targetLink, rowOffset);
  release();
}

function getTouchInit(point) {
  return { touches: [point], changedTouches: [point] };
}

/**
 * Put a finger on `link`. The browser sends every event of a touch to the element where the touch started, so
 * `TouchSensor` listens on `link`.
 */
export function pressTouch(link) {
  fireEvent.touchStart(link, getTouchInit(getPoint(link, 0.5)));
}

// Move the finger that pressed `pressedLink` to `rowOffset` of the height of `targetLink`.
export function moveTouchTo(pressedLink, targetLink, rowOffset = 0.5) {
  fireEvent.touchMove(pressedLink, getTouchInit(getPoint(targetLink, rowOffset)));
}

// Move the finger that pressed `pressedLink` down by `distance` pixels.
export function moveTouchBy(pressedLink, distance) {
  const start = getPoint(pressedLink, 0.5);
  fireEvent.touchMove(pressedLink, getTouchInit({ ...start, clientY: start.clientY + distance }));
}

export function releaseTouch(pressedLink) {
  fireEvent.touchEnd(pressedLink, { touches: [], changedTouches: [getPoint(pressedLink, 0.5)] });
}

/**
 * Tap `link` with the events a browser sends for a tap, and return whether the click was allowed. The browser sends
 * the mouse events and the click after the release of the touch.
 */
export function tap(link) {
  fireEvent.pointerDown(link);
  pressTouch(link);
  releaseTouch(link);
  fireEvent.mouseDown(link, { button: 0 });
  fireEvent.mouseUp(link, { button: 0 });
  return fireEvent.click(link, { button: 0 });
}
