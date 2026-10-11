/**
 * The grid itself: a headless TanStack Table over the rows endpoint, with sorting and pagination done
 * by the server (`manualSorting`, `manualPagination`) and the general search sent as a filter. State
 * lives in the page URL (see query.ts), so every change is a navigation the unsaved changes guard sees.
 * Rows are a server cache read keyed `['grid', rowsUrl, params]`, which every records-changed event
 * refetches; a row action announces its row's record.
 *
 * The table is the shell's DataTable: a caption names it and carries the page count, sortable headers are
 * buttons with `aria-sort` on the `th`, the first data column is the row header, and row actions name their
 * row for screen readers: edit and view stay links, and the posted actions sit in one "..." Menu per row.
 * The grid sits inside the CMS form, so every button is `type="button"` and the search box has no
 * name and keeps Enter from submitting the form.
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGlobalState } from 'piral-core';
import { Button, Dialog, Link, Menu, SearchIcon, Stack } from '@silverstripe/admin-patterns';
import { rowPaginationFeature, rowSortingFeature, tableFeatures, useTable } from '@tanstack/react-table';
import type { ColumnDef, PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { componentSlotName, silverstripeComponent } from '../api/silverstripe';
import { useUpdateHook } from '../hooks/registry';
import { routerLink, routerPath } from '../routing';
import { refetchShellServerQuery, useShellServerMutation, useShellServerQuery } from '../state/serverCache';
import { GridCellContent, HtmlContent } from './cells';
import { gridColumnDefs } from './columns';
import { DataTable } from './DataTable';
import type { DataTableColumn, DataTableRow, DataTableSort } from './DataTable';
import { fromSorting, readGridQuery, rowsParams, toSorting, withParams, writeGridQuery } from './query';
import type { GridQuery } from './query';
import { requestGrid } from './request';
import type { GridPayload, GridPostAction, GridRow, GridSlotEntry } from './types';
import './grid.css';

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });

// The legacy GridField template's fragment targets above the table; any other slot draws below it
const slotsAbove = ['before', 'buttons-before-left', 'buttons-before-right', 'toolbar-header-left', 'toolbar-header-right', 'header'];

function absolute(url: string): string {
  return new URL(url, document.baseURI).href;
}

/** A link to an admin URL routes inside the shell; any other link is a plain anchor */
function linkTarget(url: string): { href: string; renderLink?: typeof routerLink } {
  const path = routerPath(url);
  return path ? { href: path, renderLink: routerLink } : { href: absolute(url) };
}

/** How a row is named to screen readers and in dialogs: its title, or its ID */
export function rowLabel(row: GridRow): string {
  return row.title ?? `#${row.id}`;
}

/** What the status line announces after a row action */
export function actionStatus(action: GridPostAction, row: GridRow, payload: GridPayload): string {
  return payload.message ?? `${action.title}: ${rowLabel(row)} done`;
}

function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

function useRegistry() {
  const extensions = useGlobalState((state) => state.registry.extensions);
  return React.useCallback((name: string) => Boolean(extensions[componentSlotName(name)]?.length), [extensions]);
}

export interface GridTableProps {
  id: string;
  name: string;
  title: string | null;
  rowsUrl: string;
}

export const GridTable = ({ id, name, title, rowsUrl }: GridTableProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = rowsParams(readGridQuery(searchParams, name)).toString();
  // Keyed on the serialised query, so an unrelated search param change keeps the same object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = React.useMemo(() => readGridQuery(searchParams, name), [queryKey]);
  const rowsKey = ['grid', rowsUrl, queryKey] as const;
  const listing = useShellServerQuery(rowsKey, ({ signal }) => requestGrid(withParams(rowsUrl, rowsParams(query)), { signal }), {
    keepPrevious: true,
  });
  const payload = listing.data ?? null;
  const rowAction = useShellServerMutation(
    ({ action }: { action: GridPostAction; row: GridRow }) =>
      requestGrid(withParams(action.url, rowsParams(query)), { method: 'POST', body: action.args }),
    { changes: ({ row }) => (payload?.grid.modelClass ? { recordClass: payload.grid.modelClass, ids: [row.id] } : null) },
  );
  const loading = listing.isFetching || rowAction.status === 'pending';
  const [actionError, setActionError] = React.useState<string | null>(null);
  // New rows clear an action's error
  const [errorRows, setErrorRows] = React.useState(listing.data);
  if (listing.data !== errorRows) {
    setErrorRows(listing.data);
    setActionError(null);
  }
  const error = actionError ?? (listing.status === 'error' ? listing.error?.message ?? null : null);
  const [status, setStatus] = React.useState('');
  const [confirming, setConfirming] = React.useState<{ action: GridPostAction; row: GridRow } | null>(null);
  const region = React.useRef<HTMLDivElement>(null);
  const isRegistered = useRegistry();
  const navigateTo = useNavigate();

  const navigate = (next: GridQuery) => setSearchParams(writeGridQuery(searchParams, name, next), { preventScrollReset: true });

  const sorting: SortingState = payload?.sort.map((sort) => ({ id: sort.field, desc: sort.direction === 'desc' })) ?? toSorting(query.sort);
  const pagination: PaginationState = {
    pageIndex: (payload?.pagination?.page ?? 1) - 1,
    pageSize: payload?.pagination?.pageSize ?? 1,
  };
  const updateGridColumns = useUpdateHook('updateGridColumns');
  const payloadColumns = payload?.columns;
  const gridColumns = React.useMemo(
    () => (payloadColumns ? updateGridColumns(payloadColumns, { name, rowsUrl }) : []),
    [updateGridColumns, payloadColumns, name, rowsUrl],
  );
  const columns = React.useMemo(() => gridColumnDefs(gridColumns), [gridColumns]);

  const table = useTable({
    features,
    columns: columns as Array<ColumnDef<typeof features, GridRow>>,
    data: payload?.rows ?? [],
    getRowId: (row) => String(row.id),
    state: { sorting, pagination },
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
    rowCount: payload?.pagination?.totalCount ?? payload?.rows.length ?? 0,
    onSortingChange: (updater) => navigate({ ...query, sort: fromSorting(resolve(updater, sorting)), page: null }),
    onPaginationChange: (updater) => navigate({ ...query, page: resolve(updater, pagination).pageIndex + 1 }),
  });

  const caption = title || payload?.grid.pluralName || name;
  const captionId = `${id}_caption`;

  // The action's own answer carries the rows too, but the announced change refetches them for every grid
  const runAction = async (action: GridPostAction, row: GridRow) => {
    setConfirming(null);
    setActionError(null);
    try {
      const next = await rowAction.mutate({ action, row });
      await refetchShellServerQuery(rowsKey);
      setStatus(actionStatus(action, row, next));
    } catch (reason) {
      setActionError((reason as Error).message);
    } finally {
      region.current?.focus();
    }
  };

  // A click anywhere in a row opens it, as in the legacy grid; the row's own link stays the keyboard path
  const openRow = (id: string | number) => {
    const row = payload?.rows.find((candidate) => String(candidate.id) === String(id));
    const link = row?.actions.find((action) => action.type === 'link' && (action.name === 'edit' || action.name === 'view'));
    const path = link ? routerPath(link.url) : null;
    if (path) {
      navigateTo(path);
    }
  };

  const renderSlot = (slot: string) =>
    (payload?.slots[slot] ?? []).map((entry: GridSlotEntry) => {
      if ('html' in entry) {
        return <HtmlContent key={entry.html} className="admin-grid__slot" html={entry.html} />;
      }
      if (!isRegistered(entry.component)) {
        return null;
      }
      const Slot = silverstripeComponent<Record<string, unknown>>(entry.component);
      return <Slot key={entry.component} {...entry.props} grid={payload?.grid} />;
    });

  const otherSlots = Object.keys(payload?.slots ?? {}).filter((slot) => !slotsAbove.includes(slot));
  const firstDataColumn = gridColumns.find((column) => !column.actions)?.name;
  const page = payload?.pagination;
  const tableColumns: Array<DataTableColumn> = gridColumns.map((column) => ({
    name: column.name,
    title: column.title || (column.actions ? 'Actions' : column.name),
    hideTitle: !column.title,
    sortable: column.sortable,
    rowHeader: column.name === firstDataColumn,
  }));
  const tableSort: DataTableSort | null = sorting[0] ? { column: sorting[0].id, direction: sorting[0].desc ? 'desc' : 'asc' } : null;
  const tableRows: Array<DataTableRow> = table.getRowModel().rows.map(({ original: row }) => ({
    id: row.id,
    label: rowLabel(row),
    cells: Object.fromEntries(
      gridColumns.map((column) => [
        column.name,
        <>
          <GridCellContent cell={row.cells[column.name]} row={row} column={column} isRegistered={isRegistered} component={silverstripeComponent} />
          {column.actions && (
            <RowActions
              gridId={id}
              row={row}
              readonly={payload?.grid.readonly ?? true}
              onAction={(action) => (action.confirm ? setConfirming({ action, row }) : void runAction(action, row))}
            />
          )}
        </>,
      ]),
    ),
  }));

  return (
    <div className="admin-grid" id={id} ref={region} tabIndex={-1} role="region" aria-labelledby={captionId} aria-busy={loading}>
      <div className="admin-grid__toolbar">
        {slotsAbove.map(renderSlot)}
        {payload?.filter?.searchField && (
          <GridSearch
            id={`${id}_search`}
            label={payload.filter.placeholder}
            value={query.filter[payload.filter.searchField] ?? ''}
            active={payload.filter.active}
            onSearch={(text) =>
              navigate({ ...query, page: null, filter: { ...query.filter, [payload.filter!.searchField!]: text } })
            }
            onClear={() => navigate({ ...query, page: null, filter: {} })}
          />
        )}
      </div>
      <DataTable
        caption={caption}
        captionId={captionId}
        captionDetail={
          page &&
          page.totalCount > 0 && (
            <span className="admin-grid__count">
              View {(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.totalCount)} of {page.totalCount}
            </span>
          )
        }
        columns={tableColumns}
        rows={tableRows}
        sort={tableSort}
        onSort={(next) => table.setSorting([{ id: next.column, desc: next.direction === 'desc' }])}
        onOpenRow={openRow}
        emptyText={payload ? payload.emptyText : loading ? 'Loading…' : ''}
      />
      {page && page.totalPages > 1 && (
        <Stack as="nav" direction="row" align="center" justify="end" spacing="sm" wrap={false} className="admin-grid__pages" aria-label={`${caption} pages`}>
          <Button variant="tertiary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous<span className="admin-grid__hidden"> page</span>
          </Button>
          <span>
            Page {page.page} of {page.totalPages}
          </span>
          <Button variant="tertiary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next<span className="admin-grid__hidden"> page</span>
          </Button>
        </Stack>
      )}
      {otherSlots.map(renderSlot)}
      <p className="admin-grid__status" role="status">
        {loading ? `Loading ${caption}…` : status}
      </p>
      {error && (
        <p className="admin-grid__error" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        confirming={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void runAction(confirming.action, confirming.row)}
      />
    </div>
  );
};

export interface RowActionsProps {
  gridId: string;
  row: GridRow;
  readonly: boolean;
  onAction: (action: GridPostAction) => void;
}

export const RowActions = ({ gridId, row, readonly, onAction }: RowActionsProps) => {
  const label = rowLabel(row);
  const links = row.actions.filter((action) => action.type === 'link');
  const posted = readonly ? [] : row.actions.filter((action): action is GridPostAction => action.type === 'action');
  return (
    <span className="admin-grid__actions">
      {links.map((action) => (
        <Link key={action.name} {...linkTarget(action.url)}>
          {action.title}
          <span className="admin-grid__hidden"> {label}</span>
        </Link>
      ))}
      {posted.length > 0 && (
        <Menu id={`${gridId}_Actions_${row.id}`} label={`Actions for ${label}`}>
          {posted.map((action) => (
            <Button key={action.name} variant="tertiary" tone={action.confirm ? 'danger' : undefined} onClick={() => onAction(action)}>
              {action.title}
            </Button>
          ))}
        </Menu>
      )}
    </span>
  );
};

interface GridSearchProps {
  id: string;
  label: string;
  value: string;
  active: boolean;
  onSearch: (text: string) => void;
  onClear: () => void;
}

const GridSearch = ({ id, label, value, active, onSearch, onClear }: GridSearchProps) => {
  const [draft, setDraft] = React.useState(value);
  const [searched, setSearched] = React.useState(value);
  if (value !== searched) {
    setSearched(value);
    setDraft(value);
  }
  return (
    <Stack direction="row" align="center" spacing="xs" wrap={false} className="admin-grid__search" role="search">
      <label className="admin-grid__hidden" htmlFor={id}>
        {label}
      </label>
      <input
        className="admin-grid__search-input"
        id={id}
        type="search"
        placeholder={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSearch(draft.trim());
          }
        }}
      />
      <Button variant="tertiary" iconOnly icon={<SearchIcon />} onClick={() => onSearch(draft.trim())}>
        Search
      </Button>
      {active && (
        <Button variant="tertiary" onClick={onClear}>
          Clear search
        </Button>
      )}
    </Stack>
  );
};

export interface ConfirmDialogProps {
  confirming: { action: GridPostAction; row: GridRow } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialog = ({ confirming, onCancel, onConfirm }: ConfirmDialogProps) => (
  <Dialog
    open={confirming !== null}
    onClose={onCancel}
    header={confirming ? `${confirming.action.title} ${rowLabel(confirming.row)}?` : ''}
    body={confirming?.action.confirm}
    footer={
      <>
        <Button data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirming?.action.title ?? 'Confirm'}
        </Button>
      </>
    }
  />
);
