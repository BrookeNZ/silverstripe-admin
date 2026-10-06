/**
 * Maps the envelope's columns onto TanStack column definitions. Sorting is the server's
 * (`manualSorting`), so a column is sortable only when the endpoint says GridFieldSortableHeader can
 * sort it; the accessor reads the row's cell for the column, so dotted names such as `LinkTo.Title`
 * are never read as nested paths.
 */
import type { GridCellData, GridColumn, GridRow } from './types';

export interface GridColumnDef {
  id: string;
  header: string;
  enableSorting: boolean;
  accessorFn(row: GridRow): GridCellData | undefined;
}

export function gridColumnDefs(columns: ReadonlyArray<GridColumn>): Array<GridColumnDef> {
  return columns.map((column) => ({
    id: column.name,
    header: column.title ?? '',
    enableSorting: column.sortable,
    accessorFn: (row: GridRow) => row.cells[column.name],
  }));
}

export type AriaSort = 'ascending' | 'descending' | 'none';

export function ariaSort(column: GridColumn, sorted: false | 'asc' | 'desc'): AriaSort | undefined {
  if (!column.sortable) {
    return undefined;
  }
  return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
}
