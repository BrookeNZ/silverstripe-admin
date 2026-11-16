/**
 * The components in this file render the rows of a tree view. The `fetchChildren` prop of `TreeView` lists the
 * fields of a node. `TreeView` builds the value of `TreeViewContext`.
 *
 * `node.classes`, `node.iconClasses` and the `status-*` class of each badge are global class names. Rules outside
 * TreeView.scss style those classes. The header of TreeView.scss lists those rules.
 */
import React, { createContext, memo, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import i18n from 'i18n';
import { STATUS } from './TreeViewReducer';
import { loadChildren } from './TreeViewActions';
import { useTreeValue } from './treeStore';

export const TreeViewContext = createContext(null);

// Check whether `event` is a click of the main button with no modifier key. The browser handles any other click. The
// browser can then open the `href` in a new tab.
function isPlainClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

// Check whether a parent is busy. A list that loads again keeps the rows of the list. Only a parent with no list is
// busy.
export function isAwaitingChildren(childIds, status) {
  return !childIds && status !== STATUS.FAILED;
}

const LoadingRow = () => (
  <li className="tree-view__item tree-view__item--loading" role="none">
    {i18n._t('Admin.TREEVIEW_LOADING', 'Loading...')}
  </li>
);

const FailedRow = ({ level, onRetry }) => (
  <li className="tree-view__item tree-view__item--failed" role="none">
    <button
      type="button"
      className="tree-view__link"
      role="treeitem"
      aria-selected="false"
      aria-level={level}
      aria-setsize={1}
      aria-posinset={1}
      onClick={onRetry}
    >
      {i18n._t('Admin.TREEVIEW_FAILED', 'Failed to load')} {i18n._t('Admin.TREEVIEW_RETRY', 'Try again')}
    </button>
  </li>
);

FailedRow.propTypes = {
  level: PropTypes.number.isRequired,
  onRetry: PropTypes.func.isRequired,
};

const LimitedRow = ({ node, level, onShowAsList }) => {
  const handleClick = (event) => {
    if (isPlainClick(event)) {
      onShowAsList(node, event);
    }
  };
  const text = i18n._t('Admin.TREEVIEW_TOO_MANY', 'Too many records ({link})');
  // The link replaces `{link}` in the text. A translation can then place the link and the brackets around the link.
  const [beforeLink, ...afterLink] = text.includes('{link}') ? text.split('{link}') : [`${text} `];

  return (
    <li className="tree-view__item tree-view__item--limited" role="none">
      {beforeLink}
      <a
        className="tree-view__link"
        role="treeitem"
        href={node.listViewUrl}
        aria-selected="false"
        aria-level={level}
        aria-setsize={1}
        aria-posinset={1}
        onClick={handleClick}
      >
        {i18n._t('Admin.TREEVIEW_SHOW_AS_LIST', 'show as list')}
      </a>
      {afterLink.join('')}
    </li>
  );
};

LimitedRow.propTypes = {
  node: PropTypes.object.isRequired,
  level: PropTypes.number.isRequired,
  onShowAsList: PropTypes.func.isRequired,
};

// `TreeViewItems` renders the rows for the list of `parentId`, at `level`. `TreeViewItems` loads the list when the
// parent has no list and no `status` entry.
export const TreeViewItems = ({ parentId, parentNode = null, level }) => {
  const { store, fetchChildren, onShowAsList } = useContext(TreeViewContext);
  const childIds = useTreeValue(store, (tree) => tree.childIds[parentId]);
  const status = useTreeValue(store, (tree) => tree.status[parentId]);
  const limited = Boolean(parentNode && parentNode.limited);

  // `childIds`, `status` and `limited` are dependencies that the effect does not read. A change in any of those values
  // runs the effect again.
  useEffect(() => {
    // The effect reads the state again. The list can have loaded or failed since this render.
    const tree = store.getState();
    if (!tree.childIds[parentId] && !tree.status[parentId]) {
      loadChildren(store, parentId, fetchChildren);
    }
  }, [store, parentId, childIds, status, limited, fetchChildren]);

  if (limited) {
    return <LimitedRow node={parentNode} level={level} onShowAsList={onShowAsList} />;
  }
  if (status === STATUS.FAILED) {
    const handleRetry = () => loadChildren(store, parentId, fetchChildren);
    return <FailedRow level={level} onRetry={handleRetry} />;
  }
  if (isAwaitingChildren(childIds, status)) {
    return <LoadingRow />;
  }
  return childIds.map((id, index) => (
    // eslint-disable-next-line no-use-before-define
    <MemoTreeViewNode key={id} id={id} level={level} posinset={index + 1} setsize={childIds.length} />
  ));
};

TreeViewItems.propTypes = {
  parentId: PropTypes.number.isRequired,
  parentNode: PropTypes.object,
  level: PropTypes.number.isRequired,
};

const TreeViewNode = ({ id, level, posinset, setsize }) => {
  const { store, currentId, highlightedId, onOpen } = useContext(TreeViewContext);
  const node = useTreeValue(store, (tree) => tree.nodes[id]);
  const childIds = useTreeValue(store, (tree) => tree.childIds[id]);
  const status = useTreeValue(store, (tree) => tree.status[id]);
  const isExpanded = useTreeValue(store, (tree) => tree.expanded.includes(id));

  if (!node) {
    return null;
  }

  // After the list of the node loads, an empty list makes the node a leaf. Before that, an expanded node is a parent
  // whatever `hasChildren` says. A child can have been added after the server sent `hasChildren`.
  const isParent = Boolean(node.limited) || (childIds ? childIds.length > 0 : Boolean(node.hasChildren) || isExpanded);
  const isOpen = isParent && isExpanded;
  const disabled = node.canView === false;
  const statusFlags = node.statusFlags || [];

  const handleToggle = () => {
    store.dispatch({ type: isExpanded ? 'collapseNode' : 'expandNode', id });
  };

  const handleClick = (event) => {
    if (!isPlainClick(event)) {
      return;
    }
    if (disabled) {
      event.preventDefault();
    } else {
      onOpen(node, event);
    }
  };

  return (
    <li
      className={classnames('tree-view__item', { 'tree-view__item--open': isOpen }, node.classes)}
      role="none"
      data-id={id}
      data-recordtype={node.recordClass}
    >
      {isParent && (
        <span className="tree-view__toggle" aria-hidden="true" onClick={handleToggle}>
          <span className="font-icon-right-dir" />
        </span>
      )}
      <a
        className={classnames(
          'tree-view__link',
          statusFlags.map((flag) => `tree-view__link--status-${flag.key}`),
          {
            'tree-view__link--current': id === highlightedId,
            // A node that the member can view but not edit looks the same as a node that the member cannot open.
            'tree-view__link--disabled': disabled || node.canEdit === false,
          },
        )}
        role="treeitem"
        href={node.editUrl}
        title={node.tooltip}
        aria-selected="false"
        aria-level={level}
        aria-setsize={setsize}
        aria-posinset={posinset}
        aria-expanded={isParent ? isOpen : undefined}
        aria-current={id === currentId ? 'page' : undefined}
        aria-disabled={disabled ? 'true' : undefined}
        aria-busy={isOpen && !node.limited && isAwaitingChildren(childIds, status) ? 'true' : undefined}
        onClick={handleClick}
      >
        <span className={classnames('tree-view__icon', node.iconClasses)} aria-hidden="true" />
        <span className="tree-view__title">{node.treeTitle}</span>
        {statusFlags.map((flag, index) => (
          <span
            key={flag.key}
            className={classnames('badge', `status-${flag.key}`, 'tree-view__badge', {
              'tree-view__badge--extra': index > 0,
            })}
            title={flag.title}
          >
            {flag.text}
          </span>
        ))}
      </a>
      {isOpen && (
        <ul className="tree-view__group" role="group" aria-label={node.treeTitle}>
          <TreeViewItems parentId={id} parentNode={node} level={level + 1} />
        </ul>
      )}
    </li>
  );
};

TreeViewNode.propTypes = {
  id: PropTypes.number.isRequired,
  level: PropTypes.number.isRequired,
  posinset: PropTypes.number.isRequired,
  setsize: PropTypes.number.isRequired,
};

const MemoTreeViewNode = memo(TreeViewNode);
