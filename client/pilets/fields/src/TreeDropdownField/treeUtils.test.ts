import { describe, expect, it } from 'vitest';
import { findTreeByPath, findTreePath, treeFetchUrl } from './treeUtils';
import { treeDropdownFieldReducer } from '../legacy/treeDropdownFieldState';

const tree = {
  id: 0,
  children: [
    { id: 63, title: 'Form-submissions', count: 0, children: [] },
    { id: 22, title: 'Icons', count: 1, children: [{ id: 23, title: 'Small-Icons', count: 0, children: [] }] },
  ],
};

const base = 'https://example.test/';

describe('tree paths', () => {
  it('finds the path to a node, without the root id', () => {
    expect(findTreePath(tree, 23)).toEqual([22, 23]);
    expect(findTreePath(tree, 63)).toEqual([63]);
    expect(findTreePath(tree, 99)).toBeNull();
    expect(findTreePath(tree, 0)).toEqual([]);
  });

  it('finds the node a path leads to', () => {
    expect(findTreeByPath(tree, [22])?.title).toBe('Icons');
    expect(findTreeByPath(tree, [22, 99])).toBeNull();
  });
});

describe('treeFetchUrl', () => {
  const data = { urlTree: 'admin/assets/fileEditForm/2/field/ParentID/tree/', showSearch: true, multiple: false };

  it('asks for the selected node on a single field\'s first load', () => {
    expect(treeFetchUrl(data, [], '', 1, base)).toBe(`${base}${data.urlTree}?forceValue=1&format=json`);
  });

  it('asks for one level when browsing into a node', () => {
    expect(treeFetchUrl(data, [22, 23], '', 1, base)).toBe(`${base}${data.urlTree}?ID=23&format=json`);
  });

  it('asks for a flat list while searching, and never forces a multi field\'s value', () => {
    expect(treeFetchUrl({ ...data, multiple: true }, [], 'ico', 'unchanged', base)).toBe(
      `${base}${data.urlTree}?search=ico&flatList=1&format=json`,
    );
  });
});

describe('treeDropdownFieldReducer', () => {
  const empty = { visible: [], tree: {}, loading: [], failed: [], search: '', selectedValues: [] };

  it('merges a loaded level into the tree at its path and clears its loading mark', () => {
    let state = treeDropdownFieldReducer(empty, { type: 'updateTree', path: [], tree });
    state = treeDropdownFieldReducer(state, { type: 'beginTreeUpdating', path: [22] });
    expect(state.loading).toEqual([22]);
    const level = { id: 22, title: 'Icons', count: 1, children: [{ id: 23, title: 'Small-Icons (reloaded)', children: [] }] };
    state = treeDropdownFieldReducer(state, { type: 'updateTree', path: [22], tree: level });
    expect(findTreeByPath(state.tree, [22, 23])?.title).toBe('Small-Icons (reloaded)');
    expect(state.loading).toEqual([]);
  });

  it('keeps one selected value per id, sorted', () => {
    let state = treeDropdownFieldReducer(empty, { type: 'addSelectedValues', values: [{ id: 22, title: 'Icons' }] });
    state = treeDropdownFieldReducer(state, { type: 'addSelectedValues', values: [{ id: 1, title: 'A' }, { id: 22, title: 'Icons/' }] });
    expect(state.selectedValues).toEqual([{ id: 1, title: 'A' }, { id: 22, title: 'Icons/' }]);
  });
});
