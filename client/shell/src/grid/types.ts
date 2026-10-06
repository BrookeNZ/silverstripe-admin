/**
 * The GridField rows envelope the admin module's GridFieldRowsEndpoint sends (`GET <field>/rows`), and
 * the props a registered grid cell component receives. Part of Pilet API v1 through the shell's
 * extraTypes; PILET-API.md documents the contract.
 */

export interface GridComponentDeclaration {
  component: string;
  props: Record<string, unknown>;
}

export interface GridColumn {
  name: string;
  title: string | null;
  sortable: boolean;
  /** The column carries the row actions (edit, delete) */
  actions: boolean;
  /** Present when the column's provider declares a cell component; its cells are then `value` cells */
  cell: GridComponentDeclaration | null;
}

export type GridCellValue = string | number | boolean | null;

/** A JSON value, or server HTML for a provider that only renders markup */
export type GridCellData = { value: GridCellValue } | { html: string };

export interface GridLinkAction {
  name: string;
  type: 'link';
  title: string;
  url: string;
}

export interface GridPostAction {
  name: string;
  type: 'action';
  title: string;
  method: 'POST';
  url: string;
  args: Record<string, unknown>;
  confirm?: string;
}

export type GridRowAction = GridLinkAction | GridPostAction;

export interface GridRow {
  id: number;
  title: string | null;
  cells: Record<string, GridCellData | undefined>;
  actions: Array<GridRowAction>;
}

export interface GridSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface GridFilter {
  /** The filter name of the general search, bound to the grid's search box */
  searchField: string | null;
  placeholder: string;
  values: Record<string, string>;
  active: boolean;
  fields: Array<{ name: string; title: string }>;
}

export interface GridPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type GridSlotEntry = GridComponentDeclaration | { html: string };

export interface GridPayload {
  grid: {
    name: string;
    title: string | null;
    modelClass: string | null;
    pluralName: string | null;
    readonly: boolean;
    links: { self: string };
  };
  columns: Array<GridColumn>;
  rows: Array<GridRow>;
  sort: Array<GridSort>;
  filter: GridFilter | null;
  pagination: GridPagination | null;
  bulkActions: Array<unknown>;
  slots: Record<string, Array<GridSlotEntry>>;
  emptyText: string;
}

/** What a component registered as `GridField.cell.<Name>` receives */
export interface GridCellProps<P extends object = Record<string, unknown>> {
  value: GridCellValue;
  row: GridRow;
  column: GridColumn;
  /** The props the column's cell declaration carries */
  props: P;
}

/** What a component declared in a grid slot receives, plus the props its declaration carries */
export interface GridSlotProps {
  grid: GridPayload['grid'];
}
