/**
 * A data-driven list table for pilets, registered as `DataTable` (Figma "List header" 2:6388 and "File list
 * item" 2:6533): the caller passes column definitions and rows whose cells are already rendered, and the
 * table draws a 37px header of medium-weight titles and 74px rows divided by hairlines. Sorting is the
 * caller's: a sortable header is a button that asks for the next sort, and `aria-sort` on its `th` says
 * the current one. The `rowHeader` column is each row's `th`.
 *
 * `selection` adds a checkbox column at the end, named for each row's `label`; without `onToggle` the
 * boxes are drawn disabled. A click on a row outside its controls calls `onOpenRow`. Arrow up and down,
 * Home and End move focus between rows, to the control in the same position in the target row, so the
 * row header column should carry a link or button. Only from a link, button or checkbox in a cell: a text
 * field, a select and an open menu keep those keys. `currentRowId` marks the row open elsewhere, such as in the
 * details panel, with `aria-current` and the design's Active fill (Figma "File list item" 2:37437).
 *
 * GridField's GridTable renders through this too: its actions column is an ordinary column whose cells hold the
 * row's actions, its page count is the `captionDetail`, and its measures are token reassignments on `.admin-grid`
 * (see data-table.css).
 */
import * as React from 'react';
import { SortAscendingIcon, SortDescendingIcon } from '@silverstripe/admin-patterns';
import './data-table.css';

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableSort {
  column: string;
  direction: DataTableSortDirection;
}

export interface DataTableColumn {
  name: string;
  title: string;
  sortable?: boolean;
  /** The direction a header press sorts a column in when it is not already the sort; `asc` by default */
  firstDirection?: DataTableSortDirection;
  rowHeader?: boolean;
  /** The title still names the column to screen readers, as for an actions column the design leaves untitled */
  hideTitle?: boolean;
  align?: 'start' | 'center';
  /** Hidden below 768px, as the design's mobile list drops its size and date columns */
  hideWhenNarrow?: boolean;
  /** Added to the column's header and cells, for a width */
  className?: string;
}

export interface DataTableRow {
  id: string | number;
  /** Names the row's checkbox */
  label: string;
  cells: Readonly<Record<string, React.ReactNode>>;
}

export interface DataTableSelection {
  selected: ReadonlyArray<string | number>;
  onToggle?: (id: string | number, selected: boolean) => void;
}

export interface DataTableProps {
  /** Visually hidden; names the table */
  caption: string;
  captionId?: string;
  /** Shown at the end of the caption, after the hidden name */
  captionDetail?: React.ReactNode;
  columns: ReadonlyArray<DataTableColumn>;
  rows: ReadonlyArray<DataTableRow>;
  sort?: DataTableSort | null;
  onSort?: (sort: DataTableSort) => void;
  selection?: DataTableSelection;
  onOpenRow?: (id: string | number) => void;
  /** The row open elsewhere, as in the details panel */
  currentRowId?: string | number | null;
  emptyText?: string;
  className?: string;
}

const focusableSelector =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const interactiveSelector = 'a, button, input, select, textarea, label, [role="menu"]';

const rowKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

const rowStopSelector = 'a[href], button, input[type="checkbox"]';

const popupSelector = '[popover], [role="menu"], [role="listbox"], [role="dialog"], dialog';

function ariaSort(column: DataTableColumn, sort: DataTableSort | null | undefined): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) {
    return undefined;
  }
  if (sort?.column !== column.name) {
    return 'none';
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/** The sort a press on `column`'s header asks for: the other direction when it is the sort, else its first */
export function nextSort(column: DataTableColumn, sort: DataTableSort | null | undefined): DataTableSort {
  if (sort?.column === column.name) {
    return { column: column.name, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column: column.name, direction: column.firstDirection ?? 'asc' };
}

function cellClassName(column: DataTableColumn, element: 'header' | 'cell', edge: 'first' | 'last' | null): string {
  return [
    `admin-data-table__${element}`,
    edge && `admin-data-table__${element}--${edge}`,
    column.align === 'center' && `admin-data-table__${element}--center`,
    column.hideWhenNarrow && `admin-data-table__${element}--wide-only`,
    column.className,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The row, a cell, or a link, button or checkbox standing in a cell. Text fields and selects keep their own
 * keys, and so does anything inside a popup such as the row actions menu
 */
function isRowStop(target: HTMLElement, row: HTMLTableRowElement): boolean {
  if (target === row || target.parentElement === row) {
    return true;
  }
  return target.matches(rowStopSelector) && !target.closest(popupSelector);
}

/** Moves focus to the row the key names, onto the control in the same position as the focused one */
function moveBetweenRows(event: React.KeyboardEvent<HTMLTableSectionElement>) {
  if (!rowKeys.includes(event.key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const target = event.target as HTMLElement;
  const row = target.closest('tr');
  if (!row || row.parentElement !== event.currentTarget || !isRowStop(target, row)) {
    return;
  }
  const rows = Array.from(event.currentTarget.children);
  const index = rows.indexOf(row);
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 }[event.key] ?? index;
  const destination = rows[next];
  if (!destination || destination === row) {
    return;
  }
  const position = Array.from(row.querySelectorAll<HTMLElement>(focusableSelector)).indexOf(target);
  const controls = Array.from(destination.querySelectorAll<HTMLElement>(focusableSelector));
  const control = controls[Math.min(Math.max(position, 0), controls.length - 1)];
  if (control) {
    event.preventDefault();
    control.focus();
  }
}

function headerContent(column: DataTableColumn): React.ReactNode {
  return column.hideTitle ? <span className="admin-data-table__hidden">{column.title}</span> : column.title;
}

export const DataTable = ({
  caption,
  captionId,
  captionDetail,
  columns,
  rows,
  sort,
  onSort,
  selection,
  onOpenRow,
  currentRowId = null,
  emptyText,
  className,
}: DataTableProps) => {
  const selected = React.useMemo(() => new Set(selection?.selected ?? []), [selection?.selected]);
  const columnCount = Math.max(1, columns.length + (selection ? 1 : 0));
  // The selection column, when there is one, keeps its own end space
  const edge = (index: number) => (index === 0 ? 'first' : index === columns.length - 1 && !selection ? 'last' : null);

  const openRow = (event: React.MouseEvent<HTMLTableRowElement>, id: string | number) => {
    const target = event.target as HTMLElement;
    if (!onOpenRow || target.closest(interactiveSelector) || window.getSelection()?.toString()) {
      return;
    }
    onOpenRow(id);
  };

  return (
    <table className={['admin-data-table', className].filter(Boolean).join(' ')}>
      <caption className="admin-data-table__caption" id={captionId}>
        <span className="admin-data-table__hidden">{caption}</span>
        {captionDetail && <span className="admin-data-table__caption-detail">{captionDetail}</span>}
      </caption>
      <thead>
        <tr>
          {columns.map((column, index) => {
            const sorted = sort?.column === column.name ? sort.direction : null;
            return (
              <th className={cellClassName(column, 'header', edge(index))} key={column.name} scope="col" aria-sort={ariaSort(column, sort)}>
                {column.sortable && onSort ? (
                  <button className="admin-data-table__sort" type="button" onClick={() => onSort(nextSort(column, sort))}>
                    {headerContent(column)}
                    <span className="admin-data-table__sort-icon" aria-hidden="true">
                      {sorted !== 'desc' && <SortAscendingIcon />}
                      {sorted !== 'asc' && <SortDescendingIcon />}
                    </span>
                  </button>
                ) : (
                  headerContent(column)
                )}
              </th>
            );
          })}
          {selection && (
            <th className="admin-data-table__header admin-data-table__header--selection" scope="col">
              <span className="admin-data-table__hidden">Select</span>
            </th>
          )}
        </tr>
      </thead>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys from the controls inside the rows */}
      <tbody onKeyDown={moveBetweenRows}>
        {rows.length === 0 && (
          <tr className="admin-data-table__row">
            <td className="admin-data-table__empty" colSpan={columnCount}>
              {emptyText}
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr
            className={row.id === currentRowId ? 'admin-data-table__row admin-data-table__row--current' : 'admin-data-table__row'}
            key={row.id}
            aria-current={row.id === currentRowId ? 'true' : undefined}
            onClick={(event) => openRow(event, row.id)}
          >
            {columns.map((column, index) =>
              column.rowHeader ? (
                <th className={cellClassName(column, 'cell', edge(index))} key={column.name} scope="row">
                  {row.cells[column.name]}
                </th>
              ) : (
                <td className={cellClassName(column, 'cell', edge(index))} key={column.name}>
                  {row.cells[column.name]}
                </td>
              ),
            )}
            {selection && (
              <td className="admin-data-table__cell admin-data-table__cell--selection">
                <input
                  className="admin-field__check"
                  type="checkbox"
                  aria-label={`Select ${row.label}`}
                  checked={selected.has(row.id)}
                  disabled={!selection.onToggle}
                  onChange={(event) => selection.onToggle?.(row.id, event.target.checked)}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
