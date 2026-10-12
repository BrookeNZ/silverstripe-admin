/**
 * Loading the tree a level at a time over the field's `fetch` (the server cache's fetchJson by
 * default), marking each level loading, loaded or failed through the field's tree actions.
 */
import { treeFetchUrl } from './treeUtils';

/** Fetches the level at `path`, or the flat list of matches when `search` is set, into the tree */
export function loadTree(props, path, search = '') {
  props.actions.treeDropdownField.beginTreeUpdating(props.id, path);

  return props.fetch(treeFetchUrl(props.data, path, search, props.value))
    .then((treeData) => {
      props.actions.treeDropdownField.updateTree(props.id, path, treeData);

      return treeData;
    })
    .catch((error) => {
      props.actions.treeDropdownField.updateTreeFailed(props.id, path);
      if (typeof props.onLoadingError === 'function') {
        return props.onLoadingError({
          errors: [
            {
              value: error.message,
              type: 'error',
            },
          ],
        });
      }
      throw error;
    });
}

/** Loads the level at `path` unless it, or a level above it, is loading, has failed or is loaded */
export function lazyLoad(props, path) {
  const foundPrev = path.find((pathNode) => (
    props.loading.indexOf(pathNode) > -1
    || props.failed.indexOf(pathNode) > -1
  ));
  if (foundPrev) {
    return Promise.resolve({});
  }

  const foundTree = props.findTreeByPath(props.tree, path);
  if (foundTree && (foundTree.count === 0 || foundTree.children?.length)) {
    return Promise.resolve({});
  }

  return loadTree(props, path);
}
