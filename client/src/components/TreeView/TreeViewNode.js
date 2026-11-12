import React, { memo, useEffect } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import i18n from 'i18n';
import { STATUS } from './TreeViewReducer';
import { collapseNode, expandNode, loadChildren } from './TreeViewActions';
import { useTreeValue } from './treeStore';

// A modified or middle click is left to the browser, so the real href can open in a new tab
function isPlainClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

// The server adds the class `disabled` to a node the member can neither view, edit nor add children to
function isDisabled(node) {
  return node.classes.split(' ').includes('disabled');
}

// A list loading again keeps its rows, so only a parent with no list yet is busy
export function isBusy(list, status) {
  return !list && status !== STATUS.FAILED;
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

// The link stands in for the first `{link}`, so a translation places it and the brackets around it
function splitAtLink(text) {
  const index = text.indexOf('{link}');
  if (index === -1) {
    return [`${text} `, ''];
  }
  return [text.slice(0, index), text.slice(index + '{link}'.length).split('{link}').join('')];
}

const LimitedRow = ({ node, level, onShowAsList }) => {
  const handleClick = (event) => {
    if (isPlainClick(event)) {
      onShowAsList(node, event);
    }
  };
  const [beforeLink, afterLink] = splitAtLink(i18n._t('Admin.TREEVIEW_TOO_MANY', 'Too many records ({link})'));

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
      {afterLink}
    </li>
  );
};

LimitedRow.propTypes = {
  node: PropTypes.object.isRequired,
  level: PropTypes.number.isRequired,
  onShowAsList: PropTypes.func.isRequired,
};

// The rows inside an open parent, at `level`; loads the parent's children when it has no list and no status
export const TreeViewItems = ({
  store,
  parentId,
  parentNode = null,
  level,
  fetchChildren,
  onShowAsList,
  renderNode,
}) => {
  const list = useTreeValue(store, (tree) => tree.childIds[parentId]);
  const status = useTreeValue(store, (tree) => tree.status[parentId]);
  const limited = Boolean(parentNode && parentNode.limited);

  useEffect(() => {
    if (!list && !status) {
      loadChildren(store.dispatch, store.getState, parentId, fetchChildren);
    }
  }, [store, parentId, list, status, fetchChildren]);

  if (limited) {
    return <LimitedRow node={parentNode} level={level} onShowAsList={onShowAsList} />;
  }
  if (status === STATUS.FAILED) {
    const handleRetry = () => loadChildren(store.dispatch, store.getState, parentId, fetchChildren, { force: true });
    return <FailedRow level={level} onRetry={handleRetry} />;
  }
  if (isBusy(list, status)) {
    return <LoadingRow />;
  }
  return list.map((id, index) => renderNode(id, level, index + 1, list.length));
};

TreeViewItems.propTypes = {
  store: PropTypes.object.isRequired,
  parentId: PropTypes.number.isRequired,
  parentNode: PropTypes.object,
  level: PropTypes.number.isRequired,
  fetchChildren: PropTypes.func.isRequired,
  onShowAsList: PropTypes.func.isRequired,
  renderNode: PropTypes.func.isRequired,
};

const TreeViewNode = ({
  store,
  id,
  level,
  posinset,
  setsize,
  currentId,
  fetchChildren,
  onOpen,
  onShowAsList,
  renderNode,
}) => {
  const node = useTreeValue(store, (tree) => tree.nodes[id]);
  const list = useTreeValue(store, (tree) => tree.childIds[id]);
  const status = useTreeValue(store, (tree) => tree.status[id]);
  const isExpanded = useTreeValue(store, (tree) => tree.expanded.includes(id));

  if (!node) {
    return null;
  }

  // A parent whose children loaded empty shows as a leaf
  const isParent = Boolean(node.limited) || (list ? list.length > 0 : Boolean(node.hasChildren) || isExpanded);
  const isOpen = isParent && isExpanded;
  const disabled = isDisabled(node);

  const handleToggle = () => {
    store.dispatch(isExpanded ? collapseNode(id) : expandNode(id));
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
        className="tree-view__link"
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
        aria-busy={isOpen && !node.limited && isBusy(list, status) ? 'true' : undefined}
        onClick={handleClick}
      >
        <span className={node.iconClasses} aria-hidden="true" />
        <span className="tree-view__title">{node.treeTitle}</span>
        {(node.statusFlags || []).map((flag) => (
          <span key={flag.key} className={`badge status-${flag.key}`} title={flag.title}>{flag.text}</span>
        ))}
      </a>
      {isOpen && (
        <ul className="tree-view__group" role="group" aria-label={node.treeTitle}>
          <TreeViewItems
            store={store}
            parentId={id}
            parentNode={node}
            level={level + 1}
            fetchChildren={fetchChildren}
            onShowAsList={onShowAsList}
            renderNode={renderNode}
          />
        </ul>
      )}
    </li>
  );
};

TreeViewNode.propTypes = {
  store: PropTypes.object.isRequired,
  id: PropTypes.number.isRequired,
  level: PropTypes.number.isRequired,
  posinset: PropTypes.number.isRequired,
  setsize: PropTypes.number.isRequired,
  currentId: PropTypes.number,
  fetchChildren: PropTypes.func.isRequired,
  onOpen: PropTypes.func.isRequired,
  onShowAsList: PropTypes.func.isRequired,
  renderNode: PropTypes.func.isRequired,
};

export default memo(TreeViewNode);
