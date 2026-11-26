import React, { useCallback, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import i18n from 'i18n';
import ContextMenu, { CLOSE_REASON } from 'components/ContextMenu/ContextMenu';
import { STATUS, TOP_LEVEL_ID } from './TreeViewConstants';
import { isItemShown } from './TreeViewSelectors';
import { collapseItem, expandItem, setFocus, trackOpenRequest } from './TreeViewActions';
import TreeViewContext from './TreeViewContext';
import { TreeViewDragArea } from './TreeViewDrag';
import { getKeyAction, readFocusKey } from './TreeViewFocus';
import { TreeViewItems } from './TreeViewItems';
import TreeViewToggle from './TreeViewToggle';
import {
  useFocusTabStop,
  useItemContextMenu,
  useNewlyFailedParentIds,
  useReloadOnKeyChange,
  useRestoreScroll,
  useRevealCurrentItem,
  useScrollToCurrentItem,
} from './treeViewHooks';
import { getTreeStore, useTreeValue } from './treeViewStore';
import { parseItemId } from './treeViewUtils';

const TreeView = ({
  treeId,
  fetchChildren,
  fetchPath = null,
  currentId: givenCurrentId = null,
  reloadKey = null,
  onOpen = null,
  onShowAsList = null,
  getMenuItems = null,
  onMove = null,
  canDrop = null,
  label,
  titleRowText = '',
  isSidePanel = false,
}) => {
  const store = getTreeStore(treeId);
  const navRef = useRef(null);
  const listRef = useRef(null);
  const titleRowToggleRef = useRef(null);
  const keyboardMoveRef = useRef(null);
  // Whether the last press in the tree was a touch. A press of a mouse button or a key in the tree clears it.
  const isTouchPressRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const hasTitleRow = Boolean(titleRowText);
  const currentId = parseItemId(givenCurrentId);
  const isTitleRowExpanded = useTreeValue(store, (tree) => tree.expanded.includes(TOP_LEVEL_ID));
  const isCurrentItemShown = useTreeValue(store, (tree) => isItemShown(tree, currentId));

  // Call `useRevealCurrentItem` before `useReloadOnKeyChange`, for a render that changes both `currentId` and `reloadKey`.
  // The reveal then finds the ancestors in the loaded children, before the reload drops the children of collapsed items.
  useRevealCurrentItem(store, { currentId, fetchChildren, fetchPath, navRef });
  useReloadOnKeyChange(store, { reloadKey, fetchChildren, fetchPath });
  useRestoreScroll(store, navRef);
  useScrollToCurrentItem(navRef, currentId, isCurrentItemShown);
  const lastFocusedRef = useFocusTabStop(store, { listRef, titleRowToggleRef });
  const failedParentIds = useNewlyFailedParentIds(store);
  const isTopLevelAwaited = useTreeValue(
    store,
    (tree) => !tree.childIds[TOP_LEVEL_ID] && tree.status[TOP_LEVEL_ID] !== STATUS.FAILED,
  );

  const openItem = useCallback((item, event) => {
    if (onOpen) {
      event.preventDefault();
      trackOpenRequest(store, item.id, onOpen(item, event));
    }
  }, [store, onOpen]);
  const showAsList = useCallback((item, event) => {
    if (onShowAsList) {
      event.preventDefault();
      onShowAsList(item, event);
    }
  }, [onShowAsList]);
  const startKeyboardMove = useMemo(
    () => (onMove ? (item) => keyboardMoveRef.current && keyboardMoveRef.current.start(item) : null),
    [onMove],
  );
  const { contextMenu, showContextMenu, closeContextMenu } = useItemContextMenu(store, {
    getMenuItems,
    openItem,
    startKeyboardMove,
  });

  // A long press on touch starts a drag. Android also sends a `contextmenu` event for a long press, which must open
  // neither the menu of the tree nor the menu of the browser.
  const showItemContextMenu = useCallback((item, event, anchor) => {
    if (onMove && isTouchPressRef.current) {
      event.preventDefault();
      return;
    }
    showContextMenu(item, event, anchor);
  }, [onMove, showContextMenu]);

  // Each `TreeViewItem` reads the current item and the highlighted item from the store, not from `TreeViewContext`. A
  // new current or pending item then re-renders only the items whose state changes.
  const context = useMemo(() => ({
    store,
    fetchChildren,
    onOpen: openItem,
    onShowAsList: showAsList,
    onShowContextMenu: showItemContextMenu,
    isDragEnabled: Boolean(onMove),
  }), [store, fetchChildren, openItem, showAsList, showItemContextMenu, onMove]);

  const handleTitleRowToggle = () => (
    isTitleRowExpanded ? collapseItem(store, TOP_LEVEL_ID) : expandItem(store, TOP_LEVEL_ID)
  );

  // The press that starts a drag leaves focus where it is. When focus is outside the tree, `useFocusTabStop` must not
  // take a reload that removes the last focused row as lost focus.
  const handleDragStart = () => {
    if (!navRef.current.contains(document.activeElement)) {
      lastFocusedRef.current = null;
    }
    setIsDragging(true);
    if (contextMenu) {
      closeContextMenu(contextMenu, CLOSE_REASON.DISMISS);
    }
  };

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  const handleKeyDown = (event) => {
    if (isDragging) {
      return;
    }
    const row = event.target.closest('[data-focus-key]');
    if (!row || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const action = getKeyAction(store.getState(), readFocusKey(row), event.key);
    if (!action) {
      return;
    }
    event.preventDefault();
    if ('expand' in action) {
      expandItem(store, action.expand);
    } else if ('collapse' in action) {
      collapseItem(store, action.collapse);
    } else {
      setFocus(store, action.focus);
    }
  };

  // The handler is on the `nav`, so the title row toggle also counts as the last focused element. React also sends this
  // handler the focus events of the context menu, which renders outside the `nav`.
  const handleFocus = (event) => {
    if (!navRef.current.contains(event.target)) {
      return;
    }
    lastFocusedRef.current = event.target;
    const row = event.target.closest('[data-focus-key]');
    if (row) {
      setFocus(store, readFocusKey(row));
    }
  };

  const getParentTitle = (parentId) => {
    if (parentId === TOP_LEVEL_ID) {
      return titleRowText || label;
    }
    const parentItem = store.getState().items[parentId];
    return parentItem ? parentItem.treeTitle : '';
  };

  return (
    <nav
      ref={navRef}
      className={classnames('tree-view', { 'tree-view--side-panel': isSidePanel })}
      aria-label={label}
      onFocus={handleFocus}
      onTouchStartCapture={() => { isTouchPressRef.current = true; }}
      onMouseDownCapture={() => { isTouchPressRef.current = false; }}
      onKeyDownCapture={() => { isTouchPressRef.current = false; }}
    >
      {hasTitleRow && (
        <div className={classnames('tree-view__title-row', { 'tree-view__title-row--expanded': isTitleRowExpanded })}>
          <TreeViewToggle
            ref={titleRowToggleRef}
            title={titleRowText}
            isExpanded={isTitleRowExpanded}
            onClick={handleTitleRowToggle}
          />
          <span className="tree-view__title-row-text">{titleRowText}</span>
        </div>
      )}
      {(!hasTitleRow || isTitleRowExpanded) && (
        <TreeViewDragArea
          store={store}
          navRef={navRef}
          onMove={onMove}
          canDrop={canDrop}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onAnnounce={setMoveAnnouncement}
          keyboardMoveRef={keyboardMoveRef}
        >
          <ul
            ref={listRef}
            className="tree-view__list"
            role="tree"
            aria-label={label}
            aria-busy={isTopLevelAwaited ? 'true' : undefined}
            onKeyDown={handleKeyDown}
          >
            <TreeViewContext.Provider value={context}>
              <TreeViewItems parentId={TOP_LEVEL_ID} level={1} />
            </TreeViewContext.Provider>
          </ul>
        </TreeViewDragArea>
      )}
      <div className="visually-hidden" role="status">
        {failedParentIds.map((parentId) => (
          <div key={parentId}>
            {i18n.inject(i18n._t('Admin.TREEVIEW_FAILED_NAMED', 'Failed to load {title}'), {
              title: getParentTitle(parentId),
            })}
          </div>
        ))}
      </div>
      {/* The drag area unmounts while the title row is collapsed. This region outlives it. */}
      <div className="visually-hidden" role="status" aria-live="assertive" aria-atomic="true">
        {moveAnnouncement}
      </div>
      {contextMenu && (
        <ContextMenu
          key={contextMenu.showCount}
          items={contextMenu.menuItems}
          anchor={contextMenu.anchor}
          onClose={(reason) => closeContextMenu(contextMenu, reason)}
          label={contextMenu.item.treeTitle}
          subject={contextMenu.item}
        />
      )}
    </nav>
  );
};

TreeView.propTypes = {
  treeId: PropTypes.string.isRequired,
  fetchChildren: PropTypes.func.isRequired,
  fetchPath: PropTypes.func,
  currentId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  reloadKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onOpen: PropTypes.func,
  onShowAsList: PropTypes.func,
  getMenuItems: PropTypes.func,
  onMove: PropTypes.func,
  canDrop: PropTypes.func,
  label: PropTypes.string.isRequired,
  titleRowText: PropTypes.string,
  isSidePanel: PropTypes.bool,
};

export default TreeView;
