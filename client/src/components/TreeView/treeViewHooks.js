import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { CLOSE_REASON } from 'components/ContextMenu/ContextMenu';
import { STATUS } from './TreeViewConstants';
import { loadChildren, reloadTree, revealItem, setFocus, setScroll } from './TreeViewActions';
import { getTabStopKey } from './TreeViewFocus';
import { isItemShown, isTitleRowExpandedIn } from './TreeViewSelectors';
import { useTreeValue } from './treeViewStore';
import { getScrollContainer } from './treeViewUtils';

// Reveal the current item only when `currentId` changes. A remount then shows the items as the user left them. A new
// current item opened from outside the tree also takes the Tab stop. The stored `currentId` tells a new current item
// from a remount on the same item.
export function useRevealCurrentItem(store, { currentId, fetchChildren, fetchPath, navRef }) {
  const hasMountedRef = useRef(false);
  const [, renderAgain] = useReducer((count) => count + 1, 0);
  useLayoutEffect(() => {
    const tree = store.getState();
    const isMount = !hasMountedRef.current;
    hasMountedRef.current = true;
    // This effect runs again each time the host passes new functions. Only a mount retries a failed reveal, so those
    // runs do not call `fetchPath` again.
    const isRetryDue = tree.isRevealFailed && isMount;
    if (tree.currentId !== currentId && currentId !== null && !navRef.current.contains(document.activeElement)) {
      setFocus(store, null);
    }
    if (tree.currentId !== currentId || isRetryDue) {
      revealItem(store, currentId, fetchChildren, fetchPath);
      // On a mount, `revealItem()` changes the store before the new items subscribe to it. The items subscribe in a
      // passive effect, so they can paint the old state for one frame. A state update here re-renders before paint.
      if (isMount) {
        renderAgain();
      }
    }
  }, [store, currentId, fetchChildren, fetchPath, navRef]);
}

// Reload the tree when `reloadKey` changes. A layout effect runs before the passive effect in `useLoadChildren`. On a
// first mount, `useLoadChildren` then finds the top level already loading and does not fetch it again.
export function useReloadOnKeyChange(store, { reloadKey, titleRowText, fetchChildren, fetchPath }) {
  useLayoutEffect(() => {
    if (store.getState().reloadKey !== reloadKey) {
      reloadTree(store, reloadKey, { titleRowText, fetchChildren, fetchPath });
    }
  }, [store, reloadKey, titleRowText, fetchChildren, fetchPath]);
}

// Restore the scroll offset of the element that scrolls the tree before paint. The cleanup saves the offset before
// React detaches the tree.
export function useRestoreScroll(store, navRef) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const scrollContainer = getScrollContainer(nav);
    // The page scroll belongs to the host page, so a tree with no scrolling element around it leaves the page alone.
    if (scrollContainer === document.scrollingElement) {
      return undefined;
    }
    scrollContainer.scrollTop = store.getState().scrollTop;
    return () => {
      // A detached element reads a `scrollTop` of 0. Saving that value loses the offset.
      if (nav.isConnected) {
        setScroll(store, scrollContainer.scrollTop);
      }
    };
  }, [store, navRef]);
}

// Scroll to the current item once for each current id. Later expands and reloads then do not scroll back.
export function useScrollToCurrentItem(navRef, currentId, isCurrentItemShown) {
  const scrolledIdRef = useRef(null);
  useLayoutEffect(() => {
    if (currentId === null) {
      scrolledIdRef.current = null;
    } else if (isCurrentItemShown && scrolledIdRef.current !== currentId) {
      scrolledIdRef.current = currentId;
      // Keep this selector the same as the `data-id` and the class names that `TreeViewItem` renders.
      const link = navRef.current.querySelector(`[data-id="${currentId}"] > .tree-view__link`);
      if (link) {
        link.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [navRef, currentId, isCurrentItemShown]);
}

// Load the children of `parentId` when `areChildrenNeeded` is true and no load has started or failed.
export function useLoadChildren(store, parentId, fetchChildren, areChildrenNeeded) {
  useEffect(() => {
    // Read the state again: the children can have loaded or failed since this render.
    const tree = store.getState();
    if (areChildrenNeeded && !tree.childIds[parentId] && !tree.status[parentId]) {
      loadChildren(store, parentId, fetchChildren);
    }
  }, [store, parentId, fetchChildren, areChildrenNeeded]);
}

// Check whether closing a menu for `reason` returns focus to the link of the item. A dismiss returns focus only while
// focus is in the menu, because the menu takes that focus away when the menu unmounts.
function shouldReturnFocus(reason) {
  const active = document.activeElement;
  const isFocusInMenu = Boolean(active && active.closest('[role="menu"]'));
  const hasActionMovedFocus = Boolean(active) && active !== document.body && !isFocusInMenu;
  return reason === CLOSE_REASON.ESCAPE
    || reason === CLOSE_REASON.TAB
    || (reason === CLOSE_REASON.SELECT && !hasActionMovedFocus)
    || (reason === CLOSE_REASON.DISMISS && isFocusInMenu);
}

// Hold the context menu of one item at a time. `showContextMenu(item, event, anchor)` opens the context menu of
// `item` at `anchor`. It prevents the browser menu only when the item has menu items. The menu closes when the tree
// no longer shows the item, for example after a reload removes the item.
export function useItemContextMenu(store, { getMenuItems, openItem, titleRowText }) {
  const [contextMenu, setContextMenu] = useState(null);
  // `TreeView` uses this count as the key of the `ContextMenu`, so each show mounts a new menu that takes focus.
  const showCountRef = useRef(0);
  // A second event before the next render must see the open menu, so the menu is also in a ref.
  const contextMenuRef = useRef(null);

  const showContextMenu = useCallback((item, event, anchor) => {
    if (!getMenuItems) {
      return;
    }
    // Some browsers send a `contextmenu` event after Shift+F10. That event must not open the menu again.
    if (contextMenuRef.current && contextMenuRef.current.item.id === item.id) {
      event.preventDefault();
      return;
    }
    const menuItems = getMenuItems(item, { open: openItem }) || [];
    if (!menuItems.length) {
      return;
    }
    event.preventDefault();
    showCountRef.current += 1;
    contextMenuRef.current = {
      showCount: showCountRef.current,
      item,
      menuItems,
      anchor,
      link: event.currentTarget,
    };
    setContextMenu(contextMenuRef.current);
  }, [getMenuItems, openItem]);

  const closeContextMenu = useCallback((closingContextMenu, reason) => {
    if (contextMenuRef.current !== closingContextMenu) {
      return;
    }
    contextMenuRef.current = null;
    setContextMenu(null);
    if (shouldReturnFocus(reason) && closingContextMenu.link.isConnected) {
      closingContextMenu.link.focus({ preventScroll: true });
    }
  }, []);

  const isItemStillShown = useTreeValue(store, (tree) => (
    !contextMenu || isItemShown(tree, contextMenu.item.id, isTitleRowExpandedIn(tree, titleRowText))
  ));
  useEffect(() => {
    if (contextMenu && !isItemStillShown) {
      closeContextMenu(contextMenu, CLOSE_REASON.DISMISS);
    }
  }, [contextMenu, isItemStillShown, closeContextMenu]);

  return { contextMenu, showContextMenu, closeContextMenu };
}

// Move focus to the row that holds the Tab stop when focus is on another row, or when the focused element has left
// the document. Focus outside the tree stays where it is, so a mount moves no focus. With no row to focus, focus goes
// to the title row toggle. Return the ref of the last element focused in the tree, which the focus handler of the
// tree sets.
export function useFocusTabStop(store, { listRef, titleRowToggleRef }) {
  const lastFocusedRef = useRef(null);
  const tabStopKey = useTreeValue(store, getTabStopKey);
  // A change to any of these values can remove or move the focused element.
  const childIds = useTreeValue(store, (tree) => tree.childIds);
  const status = useTreeValue(store, (tree) => tree.status);
  const expanded = useTreeValue(store, (tree) => tree.expanded);
  const isTitleRowCollapsed = useTreeValue(store, (tree) => tree.isTitleRowCollapsed);

  useLayoutEffect(() => {
    const list = listRef.current;
    const tabStop = list && list.querySelector('[data-focus-key][tabindex="0"]');
    const active = document.activeElement;
    const lastFocused = lastFocusedRef.current;
    const isFocusLost = active === document.body && lastFocused !== null && !lastFocused.isConnected;
    if (!tabStop) {
      if (isFocusLost && titleRowToggleRef.current) {
        titleRowToggleRef.current.focus();
      }
      return;
    }
    const isOnOtherRow = active !== tabStop && list.contains(active) && active.hasAttribute('data-focus-key');
    if (isOnOtherRow || isFocusLost) {
      tabStop.focus({ preventScroll: true });
      tabStop.scrollIntoView({ block: 'nearest' });
    }
  }, [listRef, titleRowToggleRef, tabStopKey, childIds, status, expanded, isTitleRowCollapsed]);

  return lastFocusedRef;
}

// Return the ids of the parents whose children failed most recently while the tree is mounted. A remount announces
// nothing. A parent leaves the result when its children load again, so the next failure of that parent is announced
// again.
export function useNewlyFailedParentIds(store) {
  const status = useTreeValue(store, (tree) => tree.status);
  const [failedIds, setFailedIds] = useState([]);
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    const newIds = Object.keys(status)
      .map(Number)
      .filter((id) => status[id] === STATUS.FAILED && previousStatus[id] !== STATUS.FAILED);
    setFailedIds((ids) => {
      if (newIds.length) {
        return newIds;
      }
      const stillFailedIds = ids.filter((id) => status[id] === STATUS.FAILED);
      return stillFailedIds.length === ids.length ? ids : stillFailedIds;
    });
  }, [status]);
  return failedIds;
}
