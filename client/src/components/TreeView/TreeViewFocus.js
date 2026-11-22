/**
 * The rows that the arrow keys move through, and the row that holds the one Tab stop of the tree. Both come from the
 * tree view state.
 *
 * A row is a focusable element: the link of an item, the failed item or the too-many item. The link of an item has
 * the item id as its focus key. A parent shows at most one failed or too-many item, so that row has the focus key
 * `list:{parentId}`, with `list:0` for the top level.
 *
 * Keep `getVisibleRows()` in the same order as the rows that `TreeViewItems` renders.
 */
import { STATUS, TOP_LEVEL_ID } from './TreeViewConstants';
import { isParentItem } from './TreeViewSelectors';

const LIST_KEY_PREFIX = 'list:';

export function getListKey(parentId) {
  return `${LIST_KEY_PREFIX}${parentId}`;
}

// Return the parent id in the focus key of a failed or too-many item. Return null for the focus key of an item.
function getListParentId(key) {
  return typeof key === 'string' && key.startsWith(LIST_KEY_PREFIX) ? Number(key.slice(LIST_KEY_PREFIX.length)) : null;
}

// Return the id of the item that owns the focus key `key`. The parent owns the key of a failed or too-many item.
export function getFocusKeyItemId(key) {
  const listParentId = getListParentId(key);
  return listParentId === null ? key : listParentId;
}

export function readFocusKey(element) {
  const value = element.getAttribute('data-focus-key');
  return /^\d+$/.test(value) ? Number(value) : value;
}

function isItemLimited(tree, id) {
  const item = tree.items[id];
  return Boolean(item && item.limited);
}

function isRowExpandedParent(tree, key) {
  if (getListParentId(key) !== null) {
    return false;
  }
  const isItemExpanded = tree.expanded.includes(key);
  return isItemExpanded && isParentItem(tree.items[key], tree.childIds[key], isItemExpanded);
}

function addRows(tree, parentId, rows) {
  // A limited parent shows only its too-many item, even when it still holds children from before it became limited.
  if (isItemLimited(tree, parentId) || tree.status[parentId] === STATUS.FAILED) {
    rows.push({ key: getListKey(parentId), parentId });
    return;
  }
  const childIds = tree.childIds[parentId];
  if (!childIds) {
    return;
  }
  childIds.forEach((id) => {
    rows.push({ key: id, parentId });
    if (isRowExpandedParent(tree, id)) {
      addRows(tree, id, rows);
    }
  });
}

// Return the focusable rows of a shown tree list, top to bottom, as `{ key, parentId }`.
function getVisibleRows(tree) {
  const rows = [];
  addRows(tree, TOP_LEVEL_ID, rows);
  return rows;
}

// Return the row `key` when it is shown, or else its nearest shown ancestor. Items moved on the server can leave
// their stored parents in a loop.
function getNearestShownKey(tree, key, shownKeys) {
  if (shownKeys.has(key)) {
    return key;
  }
  const seenIds = new Set();
  let id = getFocusKeyItemId(key);
  while (tree.items[id] && !seenIds.has(id)) {
    if (shownKeys.has(id)) {
      return id;
    }
    seenIds.add(id);
    id = tree.items[id].parentId;
  }
  return null;
}

function findTabStopKey(tree) {
  const rows = getVisibleRows(tree);
  const shownKeys = new Set(rows.map((row) => row.key));
  return getNearestShownKey(tree, tree.focusedKey, shownKeys)
    ?? getNearestShownKey(tree, tree.currentId, shownKeys)
    ?? (rows.length ? rows[0].key : null);
}

const tabStopKeys = new WeakMap();

// Return the focus key of the row that holds the Tab stop. Every row calls this on each store change, so the result
// is kept for each state object.
export function getTabStopKey(tree) {
  if (!tabStopKeys.has(tree)) {
    tabStopKeys.set(tree, findTabStopKey(tree));
  }
  return tabStopKeys.get(tree);
}

// The result of each key that the tree handles, from the focused row `rows[index]`. A key with nothing to do returns
// the focused row, so the tree still prevents the default action of the key.
const keyActions = {
  ArrowUp: (tree, rows, index) => ({ focus: rows[Math.max(index - 1, 0)].key }),
  ArrowDown: (tree, rows, index) => ({ focus: rows[Math.min(index + 1, rows.length - 1)].key }),
  Home: (tree, rows) => ({ focus: rows[0].key }),
  End: (tree, rows) => ({ focus: rows[rows.length - 1].key }),
  ArrowRight: (tree, rows, index) => {
    const { key } = rows[index];
    if (getListParentId(key) === null && !tree.expanded.includes(key)
      && isParentItem(tree.items[key], tree.childIds[key], false)) {
      return { expand: key };
    }
    const nextRow = rows[index + 1];
    return { focus: nextRow && nextRow.parentId === key ? nextRow.key : key };
  },
  ArrowLeft: (tree, rows, index) => {
    const { key, parentId } = rows[index];
    if (isRowExpandedParent(tree, key)) {
      return { collapse: key };
    }
    return { focus: parentId === TOP_LEVEL_ID ? key : parentId };
  },
  // The failed item is a button. Space activates the button, which tries the request again.
  ' ': (tree, rows, index) => {
    const { key, parentId } = rows[index];
    const isFailedItem = getListParentId(key) !== null && !isItemLimited(tree, parentId);
    return isFailedItem ? null : { focus: key };
  },
};

// Return what the key `keyName` does on the row `key`: `{ focus }`, `{ expand }` or `{ collapse }`. Return null for a
// key that the browser handles.
export function getKeyAction(tree, key, keyName) {
  if (!Object.prototype.hasOwnProperty.call(keyActions, keyName)) {
    return null;
  }
  const rows = getVisibleRows(tree);
  const index = rows.findIndex((row) => row.key === key);
  if (index === -1) {
    return null;
  }
  return keyActions[keyName](tree, rows, index);
}
