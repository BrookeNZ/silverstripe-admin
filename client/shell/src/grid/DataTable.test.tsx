// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, Menu } from '@silverstripe/admin-patterns';
import { DataTable, nextSort } from './DataTable';
import type { DataTableColumn, DataTableProps, DataTableRow } from './DataTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const columns: Array<DataTableColumn> = [
  { name: 'title', title: 'Title', sortable: true, rowHeader: true },
  { name: 'size', title: 'Size', align: 'center', hideWhenNarrow: true },
  { name: 'modified', title: 'Modified', sortable: true, firstDirection: 'desc', hideWhenNarrow: true },
];

const row = (id: number, title: string): DataTableRow => ({
  id,
  label: title,
  cells: { title: <a href={`#${id}`}>{title}</a>, size: '1 KB', modified: 'Feb 22 2021' },
});

const rows = [row(1, 'Brand'), row(2, 'Logo'), row(3, 'Report')];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: Partial<DataTableProps> = {}) => {
  act(() => root.render(<DataTable caption="Files" columns={columns} rows={rows} {...props} />));
};

const press = (key: string) => {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

describe('nextSort', () => {
  it('flips the direction of the current sort column', () => {
    expect(nextSort(columns[0], { column: 'title', direction: 'asc' })).toEqual({ column: 'title', direction: 'desc' });
    expect(nextSort(columns[0], { column: 'title', direction: 'desc' })).toEqual({ column: 'title', direction: 'asc' });
  });

  it("sorts another column in its first direction", () => {
    expect(nextSort(columns[0], { column: 'modified', direction: 'desc' })).toEqual({ column: 'title', direction: 'asc' });
    expect(nextSort(columns[2], { column: 'title', direction: 'asc' })).toEqual({ column: 'modified', direction: 'desc' });
  });
});

describe('DataTable', () => {
  it('names the table and draws a header per column with the row header first', () => {
    render();
    expect(container.querySelector('caption')?.textContent).toBe('Files');
    expect(Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Title', 'Size', 'Modified']);
    expect(Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('th[scope="row"]')?.textContent)).toEqual([
      'Brand',
      'Logo',
      'Report',
    ]);
  });

  it('says the sort on the sorted header and asks for the next one', () => {
    const onSort = vi.fn();
    render({ sort: { column: 'title', direction: 'asc' }, onSort });
    const headers = container.querySelectorAll('thead th');
    expect(Array.from(headers).map((th) => th.getAttribute('aria-sort'))).toEqual(['ascending', null, 'none']);
    act(() => headers[2].querySelector('button')?.click());
    expect(onSort).toHaveBeenCalledWith({ column: 'modified', direction: 'desc' });
    act(() => headers[0].querySelector('button')?.click());
    expect(onSort).toHaveBeenLastCalledWith({ column: 'title', direction: 'desc' });
  });

  it('draws plain header text when the caller does not sort', () => {
    render();
    expect(container.querySelector('thead button')).toBeNull();
  });

  it('adds a checkbox column named for each row, disabled without a handler', () => {
    render({ selection: { selected: [2] } });
    const checks = Array.from(container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));
    expect(checks.map((check) => [check.getAttribute('aria-label'), check.checked, check.disabled])).toEqual([
      ['Select Brand', false, true],
      ['Select Logo', true, true],
      ['Select Report', false, true],
    ]);
    expect(container.querySelectorAll('thead th')[3].textContent).toBe('Select');
  });

  it('reports a checkbox change when it has a handler', () => {
    const onToggle = vi.fn();
    render({ selection: { selected: [], onToggle } });
    act(() => container.querySelector<HTMLInputElement>('tbody input')?.click());
    expect(onToggle).toHaveBeenCalledWith(1, true);
  });

  it('opens a row clicked outside its controls', () => {
    const onOpenRow = vi.fn();
    render({ onOpenRow });
    act(() => container.querySelectorAll<HTMLElement>('tbody td')[2].click());
    expect(onOpenRow).toHaveBeenCalledWith(2);
    onOpenRow.mockClear();
    act(() => container.querySelector<HTMLElement>('tbody a')?.click());
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('moves focus between rows with the arrow keys, Home and End', () => {
    render();
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('tbody a'));
    links[0].focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    press('ArrowDown');
    press('ArrowDown');
    expect(document.activeElement).toBe(links[2]);
    press('ArrowUp');
    expect(document.activeElement).toBe(links[1]);
    press('Home');
    expect(document.activeElement).toBe(links[0]);
    press('End');
    expect(document.activeElement).toBe(links[2]);
  });

  it('leaves the keys to a text field and to a control that handled them', () => {
    const cells = (id: number) => ({
      title: <input aria-label={`Name ${id}`} defaultValue="abc" />,
      size: (
        <button type="button" onKeyDown={(event) => event.preventDefault()}>
          Handled {id}
        </button>
      ),
      modified: '',
    });
    render({ rows: [1, 2].map((id) => ({ id, label: `Row ${id}`, cells: cells(id) })) });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Name 1"]')!;
    input.focus();
    press('End');
    expect(document.activeElement).toBe(input);
    const handled = container.querySelector('button')!;
    handled.focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(handled);
  });

  it('leaves arrow keys to a select in a cell', () => {
    const cells = (id: number) => ({
      title: <a href={`#${id}`}>Row {id}</a>,
      size: (
        <select aria-label={`Choice ${id}`}>
          <option>a</option>
          <option>b</option>
        </select>
      ),
      modified: '',
    });
    render({ rows: [1, 2].map((id) => ({ id, label: `Row ${id}`, cells: cells(id) })) });
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Choice 1"]')!;
    select.focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(select);
  });

  it('keeps End inside an open row actions menu', () => {
    const cells = (id: number) => ({
      title: <a href={`#${id}`}>Row {id}</a>,
      size:
        id === 1 ? (
          <Menu id={`menu-${id}`} label={`Actions for Row ${id}`}>
            <Button variant="tertiary">Archive</Button>
            <Button variant="tertiary">Delete</Button>
          </Menu>
        ) : null,
      modified: '',
    });
    render({ rows: [1, 2].map((id) => ({ id, label: `Row ${id}`, cells: cells(id) })) });
    act(() => container.querySelector<HTMLButtonElement>('#menu-1')!.click());
    container.querySelector<HTMLButtonElement>('[role="menu"] button')!.focus();
    press('End');
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  it('keeps the column when moving from a later control in the row', () => {
    const onToggle = vi.fn();
    render({ selection: { selected: [], onToggle } });
    const checks = Array.from(container.querySelectorAll<HTMLInputElement>('tbody input'));
    checks[0].focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(checks[1]);
  });

  it('keeps a hidden title naming an untitled column', () => {
    render({ columns: [...columns, { name: 'actions', title: 'Actions', hideTitle: true }] });
    const actions = container.querySelectorAll('thead th')[3];
    expect(actions.textContent).toBe('Actions');
    expect(actions.querySelector('.admin-visually-hidden')?.textContent).toBe('Actions');
  });

  it('shows the caption detail after the hidden name, under the caption id', () => {
    render({ captionId: 'files_caption', captionDetail: 'View 1–3 of 3' });
    const caption = container.querySelector('caption');
    expect(caption?.id).toBe('files_caption');
    expect(caption?.querySelector('.admin-visually-hidden')?.textContent).toBe('Files');
    expect(caption?.querySelector('.admin-data-table__caption-detail')?.textContent).toBe('View 1–3 of 3');
  });

  it('marks the current row with aria-current and its modifier, and no other', () => {
    render({ currentRowId: 2 });
    const current = Array.from(container.querySelectorAll('tbody tr')).map((tr) => [tr.getAttribute('aria-current'), tr.classList.contains('admin-data-table__row--current')]);
    expect(current).toEqual([
      [null, false],
      ['true', true],
      [null, false],
    ]);
    render({ currentRowId: null });
    expect(container.querySelector('tbody tr[aria-current], .admin-data-table__row--current')).toBeNull();
  });

  it('spans one column with the empty text when there are no columns', () => {
    render({ columns: [], rows: [], emptyText: 'Loading…' });
    expect(container.querySelector('tbody td')?.getAttribute('colspan')).toBe('1');
  });

  it('shows the empty text across every column', () => {
    render({ rows: [], emptyText: 'No files', selection: { selected: [] } });
    const empty = container.querySelector('tbody td');
    expect(empty?.textContent).toBe('No files');
    expect(empty?.getAttribute('colspan')).toBe('4');
  });
});
