import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { ROOT_ID, isShown, storedAncestorIds } from './TreeViewReducer';
import { collapseNode, expandNode, reloadTree, revealNode, setScroll } from './TreeViewActions';
import { getTreeStore, useTreeValue } from './treeStore';
import TreeViewNode, { TreeViewItems, isBusy } from './TreeViewNode';

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
  const { dispatch, getState } = store;
  const navRef = useRef(null);
  const rootOpen = isRootOpen(tree, rootTitle);
  const currentId = /^[1-9]\d*$/.test(String(givenCurrentId)) ? Number(givenCurrentId) : null;

  // Callbacks are read when called, so a new function each render re-renders no row and repeats no request
  const callbacks = useRef({ fetchChildren, fetchPath, onOpen, onShowAsList });
  useLayoutEffect(() => {
    callbacks.current = { fetchChildren, fetchPath, onOpen, onShowAsList };
  });
  const fetchLatestChildren = useCallback((parentId) => callbacks.current.fetchChildren(parentId), []);
  const openNode = useCallback((node, event) => {
    if (typeof callbacks.current.onOpen === 'function') {
      event.preventDefault();
      callbacks.current.onOpen(node, event);
    }
  }, []);
  const showAsList = useCallback((node, event) => {
    if (typeof callbacks.current.onShowAsList === 'function') {
      event.preventDefault();
      callbacks.current.onShowAsList(node, event);
    }
  }, []);

  // The path opens only when the current page changes, so a remount shows the rows as the user left them
  useLayoutEffect(() => {
    if (getState().revealedId !== currentId) {
      revealNode(dispatch, getState, currentId, callbacks.current.fetchPath);
    }
  }, [currentId, dispatch, getState]);

  // A current row the reload took off its stored path has moved, so it is revealed under its new parent
  useEffect(() => {
    if (getState().reloadKey === reloadKey) {
      return;
    }
    const wasShown = isShown(getState(), currentId, isRootOpen(getState(), rootTitle));
    reloadTree(dispatch, getState, reloadKey, fetchLatestChildren).then(() => {
      if (wasShown && getState().revealedId === currentId && !storedAncestorIds(getState(), currentId)) {
        revealNode(dispatch, getState, currentId, callbacks.current.fetchPath);
      }
    });
  }, [reloadKey, currentId, rootTitle, dispatch, getState, fetchLatestChildren]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    nav.scrollTop = getState().scrollTop;
    return () => {
      // A detached element reads 0, which would lose the offset
      if (nav.isConnected) {
        dispatch(setScroll(nav.scrollTop));
      }
    };
  }, [dispatch, getState]);

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

  const renderNode = useCallback((id, level, posinset, setsize) => (
    <TreeViewNode
      key={id}
      store={store}
      id={id}
      level={level}
      posinset={posinset}
      setsize={setsize}
      currentId={currentId}
      fetchChildren={fetchLatestChildren}
      onOpen={openNode}
      onShowAsList={showAsList}
      renderNode={renderNode}
    />
  ), [store, currentId, fetchLatestChildren, openNode, showAsList]);

  const handleRootToggle = () => {
    dispatch(rootOpen ? collapseNode(ROOT_ID) : expandNode(ROOT_ID));
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
          <TreeViewItems
            store={store}
            parentId={ROOT_ID}
            level={1}
            fetchChildren={fetchLatestChildren}
            onShowAsList={showAsList}
            renderNode={renderNode}
          />
        </ul>
      )}
    </nav>
  );
};

TreeView.propTypes = {
  // Fixed for the life of a mounted tree
  treeId: PropTypes.string.isRequired,
  /**
   * `(parentId) => Promise` of the parent's children as the server sends them: `{ id, parentId, treeTitle, tooltip,
   * recordClass, classes, iconClasses, statusFlags: [{ key, text, title }], hasChildren, limited, listViewUrl,
   * editUrl }`. The tree acts on `id`, the word `disabled` in `classes`, `hasChildren`, `limited`, `listViewUrl` and
   * `editUrl`, files each node under the parent it asked for rather than `parentId`, and only displays the rest
   */
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
