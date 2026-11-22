import React, { useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import i18n from 'i18n';
import ContextMenu from 'components/ContextMenu/ContextMenu';
import { STATUS, TOP_LEVEL_ID } from './TreeViewConstants';
import { isItemShown, isTitleRowExpandedIn } from './TreeViewSelectors';
import { collapseItem, expandItem, setFocus, trackOpenRequest } from './TreeViewActions';
import TreeViewContext from './TreeViewContext';
import { getKeyAction, readFocusKey } from './TreeViewFocus';
import { TreeViewItems } from './TreeViewItem';
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
  label,
  titleRowText = '',
  isSidePanel = false,
}) => {
  const store = getTreeStore(treeId);
  const navRef = useRef(null);
  const listRef = useRef(null);
  const titleRowToggleRef = useRef(null);
  const hasTitleRow = Boolean(titleRowText);
  const currentId = parseItemId(givenCurrentId);
  const isTitleRowExpanded = useTreeValue(store, (tree) => isTitleRowExpandedIn(tree, titleRowText));
  const isCurrentItemShown = useTreeValue(
    store,
    (tree) => isItemShown(tree, currentId, isTitleRowExpandedIn(tree, titleRowText)),
  );

  // Call `useRevealCurrentItem` before `useReloadOnKeyChange`, for a render that changes both `currentId` and `reloadKey`.
  // The reveal then finds the ancestors in the loaded children, before the reload drops the children of collapsed items.
  useRevealCurrentItem(store, { currentId, fetchChildren, fetchPath, navRef });
  useReloadOnKeyChange(store, { reloadKey, titleRowText, fetchChildren, fetchPath });
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
  const { contextMenu, showContextMenu, closeContextMenu } = useItemContextMenu(store, {
    getMenuItems,
    openItem,
    titleRowText,
  });

  // Each `TreeViewItem` reads the current item and the highlighted item from the store, not from `TreeViewContext`. A
  // new current or pending item then re-renders only the items whose state changes.
  const context = useMemo(() => ({
    store,
    fetchChildren,
    onOpen: openItem,
    onShowAsList: showAsList,
    onShowContextMenu: showContextMenu,
  }), [store, fetchChildren, openItem, showAsList, showContextMenu]);

  const handleTitleRowToggle = () => (
    isTitleRowExpanded ? collapseItem(store, TOP_LEVEL_ID) : expandItem(store, TOP_LEVEL_ID)
  );

  const handleKeyDown = (event) => {
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
      {isTitleRowExpanded && (
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
  label: PropTypes.string.isRequired,
  titleRowText: PropTypes.string,
  isSidePanel: PropTypes.bool,
};

export default TreeView;
