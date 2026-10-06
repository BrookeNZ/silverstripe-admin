/**
 * Given a tree and a path of IDs find the nested node
 *
 * @param {Object} tree
 * @param {Array} path
 * @return {Object} Nested tree
 */
export const findTreeByPath = (tree, path: Array<any>) => {
  // No valid tree
  if (!tree || Object.keys(tree).length === 0) {
    return null;
  }
  // No more path means this is the complete tree
  if (path.length === 0) {
    return tree;
  }

  const subPath = path.slice(0);
  const nextID = subPath.shift();
  const subTree = tree.children.find((nextSubTree) => (nextSubTree.id === nextID));

  // Deepen search
  if (subTree) {
    return findTreeByPath(subTree, subPath);
  }

  // No tree found
  return null;
};

/**
 * Find a tree by id
 *
 * @param {Object} tree - Tree to search
 * @param {*} id - id property of node to find path for
 * @return {Object} - The tree if found, or null if not found.
 */
export const findTreeByID = (tree, id) => {
  // No valid tree
  if (!id || !tree || !tree.children || Object.keys(tree).length === 0) {
    return null;
  }
  // Found node
  if (tree.id === id) {
    return tree;
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const child of tree.children) {
    // Search children
    const found = findTreeByID(child, id);
    if (found !== null) {
      return found;
    }
  }
  // No tree found
  return null;
};

/**
 * Finds path to the node in a tree
 *
 * @param {Object} tree - Tree to search
 * @param {*} id - id property of node to find path for
 * @param {*} treeBaseId - tree root id, may be non-zero if a custom root node has been specified
 * @return {Array} - The path to this node, or null if not found
 */
export const findTreePath = (tree, id, treeBaseId: any = 0): Array<any> | null => {
  // root node
  if (!id) {
    return [];
  }
  // No valid tree
  if (!tree || Object.keys(tree).length === 0) {
    return null;
  }
  // Base case, stops recursion
  if (tree.id === id) {
    return [tree.id];
  }
  if (!tree.children) {
    return null;
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const child of tree.children) {
    // Search children
    const childPath = findTreePath(child, id);
    // Node found in subtree, shift this id and return
    if (childPath !== null) {
      // Don't add root ID
      if (tree.id && (tree.id !== treeBaseId)) {
        childPath.unshift(tree.id);
      }
      return childPath;
    }
  }
  // No tree found
  return null;
};

/** Shape coupled to MarkedSet::getChildrenAsJSON */
export interface TreeDropdownFieldNode {
  id?: string | number;
  title?: string;
  titlePath?: string;
  contextString?: string;
  disabled?: boolean;
  parentid?: number;
  count?: number;
  depth?: number;
  expanded?: boolean;
  limited?: boolean;
  marked?: boolean;
  opened?: boolean;
  children?: Array<TreeDropdownFieldNode>;
}

/** Replaces the legacy url.parse and url.format pair; the query is unchanged */
export function treeFetchUrl(
  data: { urlTree: string; showSearch?: boolean; multiple?: boolean },
  path: Array<string | number>,
  search: string,
  value: unknown,
  base: string = document.baseURI,
): string {
  const url = new URL(data.urlTree, base);
  if (data.showSearch && search.length) {
    url.searchParams.set('search', search);
    url.searchParams.set('flatList', '1');
  }
  if (path.length) {
    url.searchParams.set('ID', String(path[path.length - 1]));
  } else if (!data.multiple && value) {
    url.searchParams.set('forceValue', String(value));
  }
  url.searchParams.set('format', 'json');
  return url.href;
}
