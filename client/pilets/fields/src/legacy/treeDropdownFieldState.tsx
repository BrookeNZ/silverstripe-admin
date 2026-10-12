/**
 * Stands in for the admin's treeDropdownField Redux slice and the react-redux connect() around
 * TreeDropdownField. The reducer cases and action creators are the legacy ones; the state lives in
 * each field instance (useReducer) instead of a store keyed by field id, so the `fieldId` the actions
 * carry is ignored. Without Redux nothing else can read a field's tree, which nothing outside the
 * field did.
 */
import * as React from 'react';

export interface TreeFieldState {
  visible: Array<any>;
  tree: any;
  loading: Array<any>;
  failed: Array<any>;
  search: string;
  selectedValues: Array<any>;
}

const initialFieldState: TreeFieldState = {
  visible: [],
  tree: {},
  loading: [],
  failed: [],
  search: '',
  selectedValues: [],
};

type Action =
  | { type: 'setVisible'; path: Array<any> }
  | { type: 'beginTreeUpdating'; path: Array<any> }
  | { type: 'updateTree'; path: Array<any>; tree: any }
  | { type: 'updateTreeFailed'; path: Array<any> }
  | { type: 'setSearch'; search: string }
  | { type: 'addSelectedValues'; values: Array<any> };

function mergeTree(base, path, tree) {
  if (path.length === 0) {
    return tree;
  }
  const [nextID, ...subPath] = path;
  if (!base.children) {
    return base;
  }
  return {
    ...base,
    children: base.children.map((subTree) => (subTree.id === nextID ? mergeTree(subTree, subPath, tree) : subTree)),
  };
}

function idFromPath(path) {
  return path.length ? path[path.length - 1] : 0;
}

const removeFromList = (list, remove) => list.filter((next) => next !== remove);

const addToList = (list, add) => (list.find((next) => next === add) ? list : [...list, add].sort());

export function treeDropdownFieldReducer(field: TreeFieldState, action: Action): TreeFieldState {
  switch (action.type) {
    case 'setVisible':
      return { ...field, visible: action.path };
    case 'beginTreeUpdating':
      return {
        ...field,
        loading: addToList(field.loading, idFromPath(action.path)),
        failed: removeFromList(field.failed, idFromPath(action.path)),
      };
    case 'updateTree':
      return {
        ...field,
        tree: mergeTree(field.tree, action.path, action.tree),
        loading: removeFromList(field.loading, idFromPath(action.path)),
        failed: removeFromList(field.failed, idFromPath(action.path)),
      };
    case 'updateTreeFailed':
      return {
        ...field,
        loading: removeFromList(field.loading, idFromPath(action.path)),
        failed: addToList(field.failed, idFromPath(action.path)),
      };
    case 'setSearch':
      return { ...field, search: action.search };
    case 'addSelectedValues': {
      const values = action.values || [];
      return {
        ...field,
        selectedValues: [...field.selectedValues.filter((value) => !values.find((item) => item.id === value.id)), ...values].sort(
          (a, b) => a.id - b.id,
        ),
      };
    }
    default:
      return field;
  }
}

function bindActions(dispatch: React.Dispatch<Action>) {
  return {
    setVisible: (fieldId, path) => dispatch({ type: 'setVisible', path }),
    beginTreeUpdating: (fieldId, path) => dispatch({ type: 'beginTreeUpdating', path }),
    updateTree: (fieldId, path, tree) => dispatch({ type: 'updateTree', path, tree }),
    updateTreeFailed: (fieldId, path) => dispatch({ type: 'updateTreeFailed', path }),
    setSearch: (fieldId, search) => dispatch({ type: 'setSearch', search }),
    addSelectedValues: (fieldId, values) => dispatch({ type: 'addSelectedValues', values }),
  };
}

export function connectTreeDropdownField(mapStateToProps: (field: TreeFieldState, ownProps: any) => object) {
  return (Field: React.ComponentType<any>): React.ComponentType<any> => {
    const Connected = (ownProps: any) => {
      const [field, dispatch] = React.useReducer(treeDropdownFieldReducer, initialFieldState);
      const actions = React.useMemo(() => ({ treeDropdownField: bindActions(dispatch) }), []);
      return <Field {...ownProps} {...mapStateToProps(field, ownProps)} actions={actions} />;
    };
    return Connected;
  };
}
