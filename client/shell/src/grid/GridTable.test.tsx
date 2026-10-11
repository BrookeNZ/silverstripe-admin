// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridTable } from './GridTable';
import type { GridPayload } from './types';

const listing = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('piral-core', () => ({
  useGlobalState: (select: (state: unknown) => unknown) => select({ registry: { extensions: {} } }),
}));
vi.mock('../hooks/registry', () => {
  const identity = <T,>(value: T) => value;
  return { useUpdateHook: () => identity };
});
vi.mock('../api/silverstripe', () => ({ componentSlotName: (name: string) => name, silverstripeComponent: () => () => null }));
vi.mock('../state/serverCache', () => ({
  useShellServerQuery: () => ({ data: listing.data, isFetching: false, status: 'success', error: null }),
  useShellServerMutation: () => ({ mutate: vi.fn(), status: 'idle' }),
  refetchShellServerQuery: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload: GridPayload = {
  grid: { name: 'Ships', title: null, modelClass: 'Ship', pluralName: 'Ships', readonly: false, links: { self: 'rows' } },
  columns: [
    { name: 'Name', title: 'Name', sortable: true, actions: false, cell: null },
    { name: 'Class', title: 'Class', sortable: false, actions: false, cell: null },
    { name: 'Actions', title: null, sortable: false, actions: true, cell: null },
  ],
  rows: [
    {
      id: 7,
      title: 'Endeavour',
      cells: { Name: { value: 'Endeavour' }, Class: { value: 'Bark' } },
      actions: [{ type: 'link', name: 'edit', title: 'Edit', url: `${location.origin}/admin/ships/item/7/edit` }],
    },
  ],
  sort: [{ field: 'Name', direction: 'asc' }],
  filter: null,
  pagination: { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 },
  bulkActions: [],
  slots: {},
  emptyText: 'No ships',
};

let container: HTMLDivElement;
let root: Root;
let path = '';

const Location = () => {
  const location = useLocation();
  path = `${location.pathname}${location.search}`;
  return null;
};

beforeEach(() => {
  listing.data = payload;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/ships']}>
        <Routes>
          <Route path="*" element={<GridTable id="Form_Ships" name="Ships" title={null} rowsUrl="rows" />} />
        </Routes>
        <Location />
      </MemoryRouter>,
    ),
  );
};

describe('GridTable', () => {
  it('labels the grid by a caption that names the table and counts its rows', () => {
    render();
    const caption = container.querySelector('caption')!;
    expect(container.querySelector('[role="region"]')?.getAttribute('aria-labelledby')).toBe(caption.id);
    expect(caption.textContent).toBe('ShipsView 1–1 of 1');
  });

  it('makes the first data column the row header and names the untitled actions column', () => {
    render();
    const headers = Array.from(container.querySelectorAll('thead th'));
    expect(headers.map((th) => th.textContent)).toEqual(['Name', 'Class', 'Actions']);
    expect(headers[2].querySelector('.admin-data-table__hidden')).not.toBeNull();
    expect(container.querySelector('tbody th[scope="row"]')?.textContent).toBe('Endeavour');
    expect(container.querySelector('tbody td:last-child a')?.textContent).toBe('Edit Endeavour');
  });

  it('says the server sort and writes the next one to the URL', () => {
    render();
    const name = container.querySelector('thead th');
    expect(name?.getAttribute('aria-sort')).toBe('ascending');
    act(() => name?.querySelector('button')?.click());
    expect(new URLSearchParams(path.split('?')[1]).toString()).toContain('-Name');
  });

  it("opens a row clicked outside its controls at its edit link", () => {
    render();
    act(() => container.querySelectorAll<HTMLElement>('tbody td')[0].click());
    expect(path).toBe('/ships/item/7/edit');
  });

  it('shows the empty text across the columns', () => {
    listing.data = { ...payload, rows: [], pagination: { ...payload.pagination!, totalCount: 0 } };
    render();
    const empty = container.querySelector('tbody td');
    expect(empty?.textContent).toBe('No ships');
    expect(empty?.getAttribute('colspan')).toBe('3');
    expect(container.querySelector('caption')?.textContent).toBe('Ships');
  });
});
