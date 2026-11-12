import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { ROOT_ID, isShown, storedAncestorIds } from './TreeViewReducer';
import { reloadTree, revealNode } from './TreeViewActions';
import { getTreeStore, useTreeValue } from './treeStore';
import { TreeViewContext, TreeViewItems, isBusy } from './TreeViewNode';

const isRootOpen = (tree, rootTitle) => !rootTitle || !tree.rootCollapsed;

const TreeView = ({
  treeId,
  fetchChildren,
  fetchPath = null,
  currentId: givenCurrentId = null,
  reloadKey = null,
  onOpen = null,
  onShowAsList = null,
  label,
  rootTitle = '',
  className = '',
}) => {
  const store = getTreeStore(treeId);
  const tree = useTreeValue(store, (state) => state);
  const navRef = useRef(null);
  const rootOpen = isRootOpen(tree, rootTitle);
  const currentId = /^[1-9]\d*$/.test(String(givenCurrentId)) ? Number(givenCurrentId) : null;

  const openNode = useCallback((node, event) => {
    if (typeof onOpen === 'function') {
      event.preventDefault();
      onOpen(node, event);
    }
  }, [onOpen]);
  const showAsList = useCallback((node, event) => {
    if (typeof onShowAsList === 'function') {
      event.preventDefault();
      onShowAsList(node, event);
    }
  }, [onShowAsList]);

  // The path opens only when the current page changes, so a remount shows the rows as the user left them
  useLayoutEffect(() => {
    if (store.getState().revealedId !== currentId) {
      revealNode(store, currentId, fetchPath);
    }
  }, [store, currentId, fetchPath]);

  // A current row the reload took off its stored path has moved, so it is revealed under its new parent
  useEffect(() => {
    if (store.getState().reloadKey === reloadKey) {
      return;
    }
    const wasShown = isShown(store.getState(), currentId, isRootOpen(store.getState(), rootTitle));
    reloadTree(store, reloadKey, fetchChildren).then(() => {
      const after = store.getState();
      const isLatest = after.reloadKey === reloadKey && after.revealedId === currentId;
      if (wasShown && isLatest && !storedAncestorIds(after, currentId)) {
        revealNode(store, currentId, fetchPath);
      }
    });
  }, [store, reloadKey, currentId, rootTitle, fetchChildren, fetchPath]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    nav.scrollTop = store.getState().scrollTop;
    return () => {
      // A detached element reads 0, which would lose the offset
      if (nav.isConnected) {
        store.dispatch({ type: 'setScroll', scrollTop: nav.scrollTop });
      }
    };
  }, [store]);

  const isCurrentShown = isShown(tree, currentId, rootOpen);
  const scrolledId = useRef(null);
  useLayoutEffect(() => {
    if (currentId === null) {
      scrolledId.current = null;
    } else if (isCurrentShown && scrolledId.current !== currentId) {
      scrolledId.current = currentId;
      const link = navRef.current.querySelector(`[data-id="${currentId}"] > .tree-view__link`);
      if (link) {
        link.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [currentId, isCurrentShown]);

  const context = useMemo(() => ({
    store,
    currentId,
    fetchChildren,
    onOpen: openNode,
    onShowAsList: showAsList,
  }), [store, currentId, fetchChildren, openNode, showAsList]);

  const handleRootToggle = () => {
    store.dispatch({ type: rootOpen ? 'collapseNode' : 'expandNode', id: ROOT_ID });
  };

  const isTopLevelBusy = isBusy(tree.childIds[ROOT_ID], tree.status[ROOT_ID]);

  return (
    <nav ref={navRef} className={classnames('tree-view', className)} aria-label={label}>
      {rootTitle && (
        <div className={classnames('tree-view__root', { 'tree-view__root--open': rootOpen })}>
          <span className="tree-view__toggle" aria-hidden="true" onClick={handleRootToggle}>
            <span className="font-icon-right-dir" />
          </span>
          <span className="tree-view__root-title">{rootTitle}</span>
        </div>
      )}
      {rootOpen && (
        <ul
          className="tree-view__list"
          role="tree"
          aria-label={label}
          aria-busy={isTopLevelBusy ? 'true' : undefined}
        >
          <TreeViewContext.Provider value={context}>
            <TreeViewItems parentId={ROOT_ID} level={1} />
          </TreeViewContext.Provider>
        </ul>
      )}
    </nav>
  );
};

TreeView.propTypes = {
  // Fixed for the life of a mounted tree
  treeId: PropTypes.string.isRequired,
  // `(parentId) => Promise` of the parent's children, each a node as `SilverStripe\Admin\HierarchyTreeHandler`
  // documents it, filed under the parent it asked for rather than its `parentId`
  fetchChildren: PropTypes.func.isRequired,
  fetchPath: PropTypes.func,
  currentId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  // Every list on screen loads again when this differs from the last value the tree applied
  reloadKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onOpen: PropTypes.func,
  onShowAsList: PropTypes.func,
  label: PropTypes.string.isRequired,
  rootTitle: PropTypes.string,
  className: PropTypes.string,
};

export default TreeView;
