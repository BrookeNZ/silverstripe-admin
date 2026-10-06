import { describe, expect, it } from 'vitest';
import { ariaSort, gridColumnDefs } from './columns';
import type { GridColumn, GridRow } from './types';

const columns: Array<GridColumn> = [
  { name: 'LinkTo.Title', title: 'Link To', sortable: true, actions: false, cell: { component: 'GridField.cell.Text', props: {} } },
  { name: 'Actions', title: null, sortable: false, actions: true, cell: null },
];

describe('gridColumnDefs', () => {
  it('maps envelope columns onto TanStack definitions and reads dotted names as cell keys', () => {
    const defs = gridColumnDefs(columns);
    const row: GridRow = { id: 1, title: null, cells: { 'LinkTo.Title': { value: 'Home' } }, actions: [] };

    expect(defs.map((def) => [def.id, def.header, def.enableSorting])).toEqual([
      ['LinkTo.Title', 'Link To', true],
      ['Actions', '', false],
    ]);
    expect(defs[0].accessorFn(row)).toEqual({ value: 'Home' });
  });

  it('only gives sortable columns an aria-sort', () => {
    expect(ariaSort(columns[0], 'desc')).toBe('descending');
    expect(ariaSort(columns[0], false)).toBe('none');
    expect(ariaSort(columns[1], false)).toBeUndefined();
  });
});
