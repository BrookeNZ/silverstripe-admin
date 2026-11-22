/**
 * The components in this file render the items of a tree view. `TreeView` builds the value of `TreeViewContext`.
 *
 * `item.classes` and `item.iconClasses` are global class names, styled outside TreeView.scss: `.record-icon` sizes the
 * icon and the generated `.class-*` rules draw image icons.
 *
 * The rows render in the order that `getVisibleRows()` in TreeViewFocus.js returns. Keep the two the same.
 */
import React, { memo, useContext } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import StatusBadge from 'components/StatusBadge/StatusBadge';
import { STATUS } from './TreeViewConstants';
import { getHighlightedId, isParentItem } from './TreeViewSelectors';
import { collapseItem, expandItem, loadChildren } from './TreeViewActions';
import TreeViewContext from './TreeViewContext';
import TreeViewFailedItem from './TreeViewFailedItem';
import { getListKey, getTabStopKey } from './TreeViewFocus';
import TreeViewLoadingItem from './TreeViewLoadingItem';
import TreeViewToggle from './TreeViewToggle';
import TreeViewTooManyItem from './TreeViewTooManyItem';
import { useLoadChildren } from './treeViewHooks';
import { useTreeValue } from './treeViewStore';
import { getContextMenuAnchor, isContextMenuKey, isPlainClick, itemPropType } from './treeViewUtils';

// The `StatusBadge` status for each status flag key that cms sends. A flag from an extension has no entry and renders a
// badge with no status.
const BADGE_STATUS_BY_FLAG_KEY = {
  addedtodraft: 'draft',
  archived: 'archived',
  deletedonlive: 'archived',
  modified: 'modified',
  removedfromdraft: 'archived',
};

export const TreeViewItems = ({ parentId, parentItem = null, level }) => {
  const { store, fetchChildren, onShowAsList } = useContext(TreeViewContext);
  const childIds = useTreeValue(store, (tree) => tree.childIds[parentId]);
  const childrenStatus = useTreeValue(store, (tree) => tree.status[parentId]);
  const listKey = getListKey(parentId);
  const isListRowTabStop = useTreeValue(store, (tree) => getTabStopKey(tree) === listKey);
  const isParentLimited = Boolean(parentItem && parentItem.limited);
  const haveChildrenFailed = childrenStatus === STATUS.FAILED;
  const areChildrenAwaited = !childIds && !haveChildrenFailed;
  // A limited parent has no children to load.
  const areChildrenNeeded = !isParentLimited && !childIds && !childrenStatus;

  useLoadChildren(store, parentId, fetchChildren, areChildrenNeeded);

  if (isParentLimited) {
    return (
      <TreeViewTooManyItem
        item={parentItem}
        focusKey={listKey}
        level={level}
        isTabStop={isListRowTabStop}
        onShowAsList={onShowAsList}
      />
    );
  }
  if (haveChildrenFailed) {
    const handleRetry = () => loadChildren(store, parentId, fetchChildren);
    return <TreeViewFailedItem focusKey={listKey} level={level} isTabStop={isListRowTabStop} onRetry={handleRetry} />;
  }
  if (areChildrenAwaited) {
    return <TreeViewLoadingItem />;
  }
  return childIds.map((id, index) => (
    // eslint-disable-next-line no-use-before-define
    <MemoTreeViewItem key={id} id={id} level={level} posInSet={index + 1} setSize={childIds.length} />
  ));
};

TreeViewItems.propTypes = {
  parentId: PropTypes.number.isRequired,
  parentItem: itemPropType,
  level: PropTypes.number.isRequired,
};

const TreeViewItem = ({ id, level, posInSet, setSize }) => {
  const { store, onOpen, onShowContextMenu } = useContext(TreeViewContext);
  const item = useTreeValue(store, (tree) => tree.items[id]);
  const childIds = useTreeValue(store, (tree) => tree.childIds[id]);
  const isItemExpanded = useTreeValue(store, (tree) => tree.expanded.includes(id));
  const isItemCurrent = useTreeValue(store, (tree) => tree.currentId === id);
  const isItemHighlighted = useTreeValue(store, (tree) => getHighlightedId(tree) === id);
  const isItemTabStop = useTreeValue(store, (tree) => getTabStopKey(tree) === id);
  const areChildrenAwaited = useTreeValue(store, (tree) => !tree.childIds[id] && tree.status[id] !== STATUS.FAILED);

  if (!item) {
    return null;
  }

  const isItemParent = isParentItem(item, childIds, isItemExpanded);
  const isExpandedParent = isItemParent && isItemExpanded;
  const canViewItem = item.canView !== false;
  const canEditItem = item.canEdit !== false;
  // An item the member can view but not edit looks the same as one the member cannot view.
  const isItemDisabled = !canViewItem || !canEditItem;
  const statusFlags = Array.isArray(item.statusFlags) ? item.statusFlags : [];

  const handleToggle = () => (isItemExpanded ? collapseItem(store, id) : expandItem(store, id));

  const handleClick = (event) => {
    if (!isPlainClick(event)) {
      return;
    }
    if (canViewItem) {
      onOpen(item, event);
    } else {
      event.preventDefault();
    }
  };

  const handleContextMenu = (event) => onShowContextMenu(item, event, getContextMenuAnchor(event));

  const handleKeyDown = (event) => {
    if (isContextMenuKey(event)) {
      onShowContextMenu(item, event, event.currentTarget);
    }
  };

  // `useScrollToCurrentItem` finds the link by `data-id` and `tree-view__link`. Keep both the same there.
  return (
    <li
      className={classnames('tree-view__item', { 'tree-view__item--expanded': isExpandedParent }, item.classes)}
      role="none"
      data-id={id}
      data-recordtype={item.recordClass}
    >
      {isItemParent && (
        <TreeViewToggle title={item.treeTitle} isExpanded={isExpandedParent} isMouseOnly onClick={handleToggle} />
      )}
      <a
        className={classnames(
          'tree-view__link',
          statusFlags.map((flag) => `tree-view__link--status-${flag.key}`),
          {
            'tree-view__link--current': isItemHighlighted,
            'tree-view__link--disabled': isItemDisabled,
          },
        )}
        role="treeitem"
        href={item.editUrl}
        title={item.tooltip}
        tabIndex={isItemTabStop ? 0 : -1}
        data-focus-key={id}
        aria-selected="false"
        aria-level={level}
        aria-setsize={setSize}
        aria-posinset={posInSet}
        aria-expanded={isItemParent ? isExpandedParent : undefined}
        aria-current={isItemCurrent ? 'page' : undefined}
        aria-disabled={canViewItem ? undefined : 'true'}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        <span className={classnames('tree-view__icon', item.iconClasses)} aria-hidden="true" />
        <span className="tree-view__title">{item.treeTitle}</span>
        {statusFlags.map((flag) => (
          <StatusBadge
            key={flag.key}
            status={BADGE_STATUS_BY_FLAG_KEY[flag.key]}
            text={flag.text}
          />
        ))}
      </a>
      {isExpandedParent && (
        <ul
          className="tree-view__group"
          role="group"
          aria-label={item.treeTitle}
          aria-busy={!item.limited && areChildrenAwaited ? 'true' : undefined}
        >
          <TreeViewItems parentId={id} parentItem={item} level={level + 1} />
        </ul>
      )}
    </li>
  );
};

TreeViewItem.propTypes = {
  id: PropTypes.number.isRequired,
  level: PropTypes.number.isRequired,
  posInSet: PropTypes.number.isRequired,
  setSize: PropTypes.number.isRequired,
};

const MemoTreeViewItem = memo(TreeViewItem);
