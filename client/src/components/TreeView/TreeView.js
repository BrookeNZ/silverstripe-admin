/**
 * `TreeView` renders a navigation tree. The tree loads each list of children when the list is first shown.
 *
 * The state of the tree lives in a store from treeStore.js. The store outlives the component.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { ROOT_ID, areStoredAncestorsExpanded, isMissingFromLoadedPath, isShown } from './TreeViewReducer';
import { reloadTree, revealNode } from './TreeViewActions';
import { getTreeStore, useTreeValue } from './treeStore';
import { TreeViewContext, TreeViewItems, isAwaitingChildren } from './TreeViewNode';

// Check whether the root row is open. A tree without a `rootTitle` has no root row to collapse.
const isRootOpenIn = (tree, rootTitle) => !rootTitle || !tree.rootCollapsed;

// Return `value` as a node id, or null when `value` is not a positive whole number. `ROOT_ID` is never a current node.
const toNodeId = (value) => (/^[1-9]\d*$/.test(String(value)) ? Number(value) : null);

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
  const isRootOpen = isRootOpenIn(tree, rootTitle);
  const currentId = toNodeId(givenCurrentId);

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

  // The effect reveals the current node only when `currentId` changes. A remount then shows the rows as the user left
  // them.
  useLayoutEffect(() => {
    if (store.getState().revealedId !== currentId) {
      revealNode(store, currentId, fetchPath);
    }
  }, [store, currentId, fetchPath]);

  // The effect reloads the tree when `reloadKey` changes. A shown current node that has left a reloaded list above the
  // node has moved. The effect then reveals the moved node under the new parent.
  useEffect(() => {
    if (store.getState().reloadKey === reloadKey) {
      return;
    }
    // The effect reads the state before the reload starts. The reload can remove the current node from a list above
    // the node.
    const before = store.getState();
    const wasShown = isShown(before, currentId, isRootOpenIn(before, rootTitle));
    reloadTree(store, reloadKey, fetchChildren).then(() => {
      const after = store.getState();
      const { revealedId } = after;
      const isLatest = after.reloadKey === reloadKey;
      // A node selected during the reload has no earlier state to compare. The node counts as having been shown.
      const wasRevealedShown = revealedId === currentId ? wasShown : revealedId !== null;
      const isStillOpen = areStoredAncestorsExpanded(after, revealedId, isRootOpenIn(after, rootTitle));
      const hasLeftStoredPath = isMissingFromLoadedPath(after, revealedId);
      if (isLatest && wasRevealedShown && isStillOpen && hasLeftStoredPath) {
        revealNode(store, revealedId, fetchPath);
      }
    });
  }, [store, reloadKey, currentId, rootTitle, fetchChildren, fetchPath]);

  // This layout effect restores the scroll offset before paint. The cleanup reads the offset before React detaches the
  // element.
  useLayoutEffect(() => {
    const nav = navRef.current;
    nav.scrollTop = store.getState().scrollTop;
    return () => {
      // A detached element reads a `scrollTop` of 0. Saving that value loses the offset.
      if (nav.isConnected) {
        store.dispatch({ type: 'setScroll', scrollTop: nav.scrollTop });
      }
    };
  }, [store]);

  const isCurrentShown = isShown(tree, currentId, isRootOpen);
  // The effect scrolls to the current row once for each current id. Later expands and reloads then do not scroll back.
  const scrolledId = useRef(null);
  useLayoutEffect(() => {
    if (currentId === null) {
      scrolledId.current = null;
    } else if (isCurrentShown && scrolledId.current !== currentId) {
      scrolledId.current = currentId;
      // Keep this selector the same as the `data-id` and the class names that `TreeViewNode` renders.
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
    store.dispatch({ type: isRootOpen ? 'collapseNode' : 'expandNode', id: ROOT_ID });
  };

  const isTopLevelBusy = isAwaitingChildren(tree.childIds[ROOT_ID], tree.status[ROOT_ID]);

  return (
    <nav ref={navRef} className={classnames('tree-view', className)} aria-label={label}>
      {rootTitle && (
        <div className={classnames('tree-view__root', { 'tree-view__root--open': isRootOpen })}>
          <span className="tree-view__toggle" aria-hidden="true" onClick={handleRootToggle}>
            <span className="font-icon-right-dir" />
          </span>
          <span className="tree-view__root-title">{rootTitle}</span>
        </div>
      )}
      {isRootOpen && (
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
  /**
   * The id of the tree state, fixed for the life of a mounted tree. Trees mounted with the same `treeId` share one
   * state. Give those trees the same `currentId`.
   */
  treeId: PropTypes.string.isRequired,
  /**
   * The function `(parentId) => Promise` of the list of children. The tree lists each child under the requested
   * parent, whatever the child's `parentId` says.
   *
   * The tree reads these fields of a child:
   * - `id`, `treeTitle`, `hasChildren`, `limited`, `listViewUrl`, `editUrl` and `canView` on every node.
   * - `classes`, `iconClasses`, `recordClass`, `tooltip` and `statusFlags`, a list of `{key, text, title}`, when they
   *   are set.
   */
  fetchChildren: PropTypes.func.isRequired,
  /**
   * The function `(id) => Promise` of the ancestor ids of the node, top level first. Without `fetchPath`, the tree
   * reveals only a node that is already loaded.
   */
  fetchPath: PropTypes.func,
  currentId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  /** A value whose change reloads the tree. `reload()` in TreeViewReducer.js chooses the lists that load again. */
  reloadKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onOpen: PropTypes.func,
  onShowAsList: PropTypes.func,
  label: PropTypes.string.isRequired,
  rootTitle: PropTypes.string,
  className: PropTypes.string,
};

export default TreeView;
