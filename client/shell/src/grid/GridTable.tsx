/**
 * The grid itself: a headless TanStack Table over the rows endpoint, with sorting and pagination done
 * by the server (`manualSorting`, `manualPagination`) and the general search sent as a filter. State
 * lives in the page URL (see query.ts), so every change is a navigation the unsaved changes guard sees.
 *
 * Markup is a plain table: a caption names it, sortable headers are buttons with `aria-sort` on the
 * `th`, the first data column is the row header, and row actions name their row for screen readers.
 * The grid sits inside the CMS form, so every button is `type="button"` and the search box has no
 * name and keeps Enter from submitting the form.
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGlobalState, useGlobalStateContext } from 'piral-core';
import { Button, Dialog, Link, SearchIcon, SortAscendingIcon, SortDescendingIcon } from '@silverstripe/admin-patterns';
import { rowPaginationFeature, rowSortingFeature, tableFeatures, useTable } from '@tanstack/react-table';
import type { ColumnDef, PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { componentSlotName, silverstripeComponent } from '../api/silverstripe';
import { routerLink, routerPath } from '../routing';
import { recordsChangedEvent } from '../events';
import { GridCellContent, HtmlContent } from './cells';
import { ariaSort, gridColumnDefs } from './columns';
import { fromSorting, readGridQuery, rowsParams, toSorting, withParams, writeGridQuery } from './query';
import type { GridQuery } from './query';
import { requestGrid } from './request';
import type { GridColumn, GridPayload, GridPostAction, GridRow, GridSlotEntry } from './types';
import './grid.css';

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });

const slotsAbove = ['before', 'buttons-before-left', 'buttons-before-right', 'toolbar-header-left', 'toolbar-header-right', 'header'];

function absolute(url: string): string {
  return new URL(url, document.baseURI).href;
}

/** A link to an admin URL routes inside the shell; any other link is a plain anchor */
function linkTarget(url: string): { href: string; renderLink?: typeof routerLink } {
  const path = routerPath(url);
  return path ? { href: path, renderLink: routerLink } : { href: absolute(url) };
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
  const query = React.useMemo(() => readGridQuery(searchParams, name), [queryKey]);
  const [payload, setPayload] = React.useState<GridPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('');
  const [confirming, setConfirming] = React.useState<{ action: GridPostAction; row: GridRow } | null>(null);
  const region = React.useRef<HTMLDivElement>(null);
  const isRegistered = useRegistry();
  const [revision, setRevision] = React.useState(0);
  const context = useGlobalStateContext();
  const navigateTo = useNavigate();

  React.useEffect(() => {
    const reload = () => setRevision((current) => current + 1);
    context.on(recordsChangedEvent, reload);
    return () => {
      context.off(recordsChangedEvent, reload);
    };
  }, [context]);

  React.useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    requestGrid(withParams(rowsUrl, rowsParams(query)), { signal: abort.signal })
      .then((next) => {
        setPayload(next);
        setError(null);
      })
      .catch((reason: Error) => {
        if (!abort.signal.aborted) {
          setError(reason.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [rowsUrl, query, revision]);

  const navigate = (next: GridQuery) => setSearchParams(writeGridQuery(searchParams, name, next), { preventScrollReset: true });

  const sorting: SortingState = payload?.sort.map((sort) => ({ id: sort.field, desc: sort.direction === 'desc' })) ?? toSorting(query.sort);
  const pagination: PaginationState = {
    pageIndex: (payload?.pagination?.page ?? 1) - 1,
    pageSize: payload?.pagination?.pageSize ?? 1,
  };
  const columns = React.useMemo(() => gridColumnDefs(payload?.columns ?? []), [payload?.columns]);
  const columnsByName = React.useMemo(
    () => new Map<string, GridColumn>((payload?.columns ?? []).map((column) => [column.name, column])),
    [payload?.columns],
  );

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

  const runAction = async (action: GridPostAction, row: GridRow) => {
    setConfirming(null);
    setLoading(true);
    try {
      setPayload(await requestGrid(withParams(action.url, rowsParams(query)), { method: 'POST', body: action.args }));
      setError(null);
      setStatus(`${action.title}: ${row.title ?? row.id} done`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
      region.current?.focus();
    }
  };

  // A click anywhere in a row opens it, as in the legacy grid; the row's own link stays the keyboard path
  const openRow = (event: React.MouseEvent<HTMLTableRowElement>, row: GridRow) => {
    const link = row.actions.find((action) => action.type === 'link' && (action.name === 'edit' || action.name === 'view'));
    const path = link ? routerPath(link.url) : null;
    const target = event.target as HTMLElement;
    if (!path || target.closest('a, button, input, select, textarea, label') || window.getSelection()?.toString()) {
      return;
    }
    navigateTo(path);
  };

  const renderSlot = (slot: string) =>
    (payload?.slots[slot] ?? []).map((entry: GridSlotEntry, index: number) => {
      if ('html' in entry) {
        return <HtmlContent key={`${slot}-${index}`} className="admin-grid__slot" html={entry.html} />;
      }
      if (!isRegistered(entry.component)) {
        return null;
      }
      const Slot = silverstripeComponent(entry.component);
      return <Slot key={`${slot}-${index}`} {...entry.props} grid={payload?.grid} />;
    });

  const otherSlots = Object.keys(payload?.slots ?? {}).filter((slot) => !slotsAbove.includes(slot));
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const rows = table.getRowModel().rows;
  const firstDataColumn = payload?.columns.find((column) => !column.actions)?.name;
  const page = payload?.pagination;

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
      <table className="admin-grid__table">
        <caption className="admin-grid__caption" id={captionId}>
          <span className="admin-grid__hidden">{caption}</span>
          {page && page.totalCount > 0 && (
            <span className="admin-grid__count">
              View {(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.totalCount)} of {page.totalCount}
            </span>
          )}
        </caption>
        <thead>
          <tr>
            {headers.map((header) => {
              const column = columnsByName.get(header.column.id)!;
              const sorted = header.column.getIsSorted();
              return (
                <th className="admin-grid__header" key={header.id} scope="col" aria-sort={ariaSort(column, sorted)}>
                  {column.sortable ? (
                    <button className="admin-grid__sort" type="button" onClick={header.column.getToggleSortingHandler()}>
                      {column.title}
                      <span className="admin-grid__sort-icon" aria-hidden="true">
                        {sorted !== 'desc' && <SortAscendingIcon />}
                        {sorted !== 'asc' && <SortDescendingIcon />}
                      </span>
                    </button>
                  ) : column.title ? (
                    column.title
                  ) : (
                    <span className="admin-grid__hidden">{column.actions ? 'Actions' : column.name}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="admin-grid__empty" colSpan={Math.max(1, headers.length)}>
                {payload ? payload.emptyText : loading ? 'Loading…' : ''}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr className="admin-grid__row" key={row.id} onClick={(event) => openRow(event, row.original)}>
              {row.getAllCells().map((cell) => {
                const column = columnsByName.get(cell.column.id)!;
                const content = (
                  <>
                    <GridCellContent
                      cell={row.original.cells[column.name]}
                      row={row.original}
                      column={column}
                      isRegistered={isRegistered}
                      component={silverstripeComponent}
                    />
                    {column.actions && (
                      <RowActions row={row.original} readonly={payload?.grid.readonly ?? true} onAction={(action) => (action.confirm ? setConfirming({ action, row: row.original }) : runAction(action, row.original))} />
                    )}
                  </>
                );
                return column.name === firstDataColumn ? (
                  <th className="admin-grid__cell" key={cell.id} scope="row">
                    {content}
                  </th>
                ) : (
                  <td className="admin-grid__cell" key={cell.id}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {page && page.totalPages > 1 && (
        <nav className="admin-grid__pages" aria-label={`${caption} pages`}>
          <Button variant="tertiary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous<span className="admin-grid__hidden"> page</span>
          </Button>
          <span>
            Page {page.page} of {page.totalPages}
          </span>
          <Button variant="tertiary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next<span className="admin-grid__hidden"> page</span>
          </Button>
        </nav>
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
        onConfirm={() => confirming && runAction(confirming.action, confirming.row)}
      />
    </div>
  );
};

interface RowActionsProps {
  row: GridRow;
  readonly: boolean;
  onAction(action: GridPostAction): void;
}

const RowActions = ({ row, readonly, onAction }: RowActionsProps) => {
  const label = row.title ?? `#${row.id}`;
  return (
    <span className="admin-grid__actions">
      {row.actions.map((action) =>
        action.type === 'link' ? (
          <Link key={action.name} {...linkTarget(action.url)}>
            {action.title}
            <span className="admin-grid__hidden"> {label}</span>
          </Link>
        ) : readonly ? null : (
          <button className="admin-grid__action" key={action.name} type="button" onClick={() => onAction(action)}>
            {action.title}
            <span className="admin-grid__hidden"> {label}</span>
          </button>
        ),
      )}
    </span>
  );
};

interface GridSearchProps {
  id: string;
  label: string;
  value: string;
  active: boolean;
  onSearch(text: string): void;
  onClear(): void;
}

const GridSearch = ({ id, label, value, active, onSearch, onClear }: GridSearchProps) => {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <div className="admin-grid__search" role="search">
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
    </div>
  );
};

export interface ConfirmDialogProps {
  confirming: { action: GridPostAction; row: GridRow } | null;
  onCancel(): void;
  onConfirm(): void;
}

export const ConfirmDialog = ({ confirming, onCancel, onConfirm }: ConfirmDialogProps) => (
  <Dialog
    open={confirming !== null}
    onClose={onCancel}
    header={confirming ? `${confirming.action.title} ${confirming.row.title ?? `#${confirming.row.id}`}?` : ''}
    body={confirming?.action.confirm}
    footer={
      <>
        <Button autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirming?.action.title}
        </Button>
      </>
    }
  />
);
