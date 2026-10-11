// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { DataTableProps, PageComponentProps } from '@silverstripe/admin-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilesSection, filesSectionHeader, folderStaleTime } from './FilesSection';
import type { FilesSectionOptions } from './FilesSection';
import type { FileItem, FolderListing } from './api';
import { fileSort, formatModified, tableSort } from './FileTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options: FilesSectionOptions = { routePrefix: '/assets', sectionTitle: 'Files', readEndpoint: 'https://cms.test/admin/assets/api/read/' };

const listing = (overrides: Partial<FolderListing>): FolderListing => ({
  id: 9,
  title: 'Logos',
  canEdit: true,
  ancestors: [],
  items: [],
  totalCount: 0,
  page: 1,
  requestedPage: 1,
  pageCount: 1,
  ...overrides,
});

describe('filesSectionHeader', () => {
  it('titles the root "Files" with no breadcrumb', () => {
    expect(filesSectionHeader(0, listing({ id: 0, title: null }), options)).toEqual({ title: 'Files' });
  });

  it('puts "Files" first and then each ancestor down to the parent', () => {
    const header = filesSectionHeader(
      9,
      listing({
        ancestors: [
          { id: 3, title: 'Brand' },
          { id: 5, title: 'Print' },
        ],
      }),
      options,
    );
    expect(header).toEqual({
      title: 'Logos',
      crumbs: [
        { label: 'Files', to: '/assets/' },
        { label: 'Brand', to: '/assets/show/3' },
        { label: 'Print', to: '/assets/show/5' },
      ],
    });
  });

  it('shows only the root crumb while another folder is still on screen', () => {
    expect(filesSectionHeader(12, listing({ ancestors: [{ id: 3, title: 'Brand' }] }), options)).toEqual({
      title: 'Files',
      crumbs: [{ label: 'Files', to: '/assets/' }],
    });
  });
});

let container: HTMLDivElement;
let root: Root;
let fetchJson: ReturnType<typeof vi.fn>;
let headers: Array<unknown>;
let queryOptions: unknown;

// Stands in for the shell's server cache: runs the fetcher per key with the shell fetch, which is the mocked boundary
function useServerQuery(
  key: ReadonlyArray<unknown>,
  fetcher: (context: { signal: AbortSignal; request: typeof fetchJson }) => Promise<unknown>,
  options?: unknown,
) {
  queryOptions = options;
  const serialised = JSON.stringify(key);
  const [state, setState] = React.useState<{ key: string; data?: unknown; error?: unknown } | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    fetcher({ signal: controller.signal, request: fetchJson }).then(
      (data) => setState({ key: serialised, data }),
      (error: unknown) => setState({ key: serialised, error }),
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised key, as the real cache is
  }, [serialised]);
  const current = state?.key === serialised ? state : null;
  return {
    status: current ? (current.error ? 'error' : 'success') : 'pending',
    data: current?.data,
    error: current?.error ?? null,
    isFetching: false,
    refetch: async () => current?.data,
  };
}

let tableProps: DataTableProps | null;

// Stands in for the shell's DataTable, which has its own tests: draws what it is given and reports a header press
const DataTable = (props: DataTableProps) => {
  tableProps = props;
  return (
    <table className={props.className}>
      <thead>
        <tr>
          {props.columns.map((column) => (
            <th key={column.name}>
              {column.sortable ? (
                <button type="button" onClick={() => props.onSort?.({ column: column.name, direction: 'desc' })}>
                  {column.title}
                </button>
              ) : (
                column.title
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id} data-id={row.id} onClick={() => props.onOpenRow?.(row.id)}>
            {props.columns.map((column) => (
              <td key={column.name}>{row.cells[column.name]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const piral = {
  useServerQuery,
  getSilverstripeComponent: (name: string) => (name === 'DataTable' ? DataTable : () => null),
  setSectionHeader: (header: unknown) => {
    headers.push(header);
    return () => undefined;
  },
} as unknown as PageComponentProps['piral'];

const Location = () => <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;

const render = async (path: string) => {
  const Page = createFilesSection(options);
  const page = <Page piral={piral} {...({} as Omit<PageComponentProps, 'piral'>)} />;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/assets" element={page} />
          <Route path="/assets/show/:folderId" element={page} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
  });
};

const location = () => container.querySelector('[data-testid="location"]')?.textContent;

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
};

const linkNamed = (name: string) =>
  Array.from(container.querySelectorAll('a')).find((link) => link.textContent?.trim() === name);

const readBody = {
  id: 9,
  title: 'Logos',
  ancestors: [{ id: 3, title: 'Brand' }],
  children: {
    pageInfo: { totalCount: 2 },
    nodes: [
      { id: 12, title: 'Archive', type: 'folder', category: 'folder', extension: '', thumbnail: null, lastEdited: '2021-02-22 09:00:00' },
      {
        id: 40,
        title: 'Wordmark',
        type: 'file',
        category: 'image',
        extension: 'png',
        thumbnail: '/assets/wordmark.png',
        size: '13 KB',
        lastEdited: '2023-04-13 10:30:00',
        draft: true,
      },
    ],
  },
};

const buttonNamed = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  headers = [];
  tableProps = null;
  fetchJson = vi.fn().mockResolvedValue(readBody);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the folder page', () => {
  it('reads the folder named in the route at the page in the query', async () => {
    await render('/assets/show/9?page=2');
    expect(fetchJson).toHaveBeenCalledWith('https://cms.test/admin/assets/api/read/9?page=2', expect.anything());
  });

  it('trusts the listing across a remount for its staleTime, and names its rows so an event about one refetches it', async () => {
    await render('/assets/show/9');
    expect(queryOptions).toMatchObject({ staleTime: folderStaleTime, keepPrevious: true });
    expect((queryOptions as { records: (listing: FolderListing) => Array<number> }).records(listing({ items: [{ id: 40 } as FileItem] }))).toEqual([40]);
  });

  it('reads the root folder at /assets', async () => {
    await render('/assets');
    expect(fetchJson).toHaveBeenCalledWith('https://cms.test/admin/assets/api/read/0?page=1', expect.anything());
  });

  it('sets the folder title and its ancestors as the header', async () => {
    await render('/assets/show/9');
    expect(headers[headers.length - 1]).toEqual({
      title: 'Logos',
      crumbs: [
        { label: 'Files', to: '/assets/' },
        { label: 'Brand', to: '/assets/show/3' },
      ],
    });
  });

  it('says the folder is empty in legacy words', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { pageInfo: { totalCount: 0 }, nodes: [] } });
    await render('/assets/show/9');
    expect(container.textContent).toContain('No files');
    expect(container.querySelector('.files-gallery')).toBeNull();
  });

  it('opens a folder in the gallery', async () => {
    await render('/assets/show/9');
    await click(linkNamed('Archive'));
    expect(location()).toBe('/assets/show/12');
    expect(fetchJson).toHaveBeenLastCalledWith('https://cms.test/admin/assets/api/read/12?page=1', expect.anything());
  });

  it('opens a file on the file edit route', async () => {
    await render('/assets/show/9');
    await click(linkNamed('Wordmark'));
    expect(location()).toBe('/assets/show/9/edit/40');
  });

  it('draws each checkbox disabled and named for its item', async () => {
    await render('/assets/show/9');
    const checks = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(checks.map((check) => [check.getAttribute('aria-label'), check.disabled])).toEqual([
      ['Select Archive', true],
      ['Select Wordmark', true],
    ]);
  });

  it('links the pages of a folder longer than one page', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { ...readBody.children, pageInfo: { totalCount: 120 } } });
    await render('/assets/show/9?page=2');
    expect(container.querySelector('nav[aria-label="Pages of this folder"]')?.textContent).toContain('Page 2 of 3');
    await click(linkNamed('Next'));
    expect(location()).toBe('/assets/show/9?page=3');
    await click(linkNamed('Previous'));
    expect(location()).toBe('/assets/show/9?page=2');
  });

  it('shows the last page, with its pager, for a page past the end', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { ...readBody.children, pageInfo: { totalCount: 60 } } });
    await render('/assets/show/9?page=9');
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchJson).toHaveBeenCalledWith('https://cms.test/admin/assets/api/read/9?page=2', expect.anything());
    expect(location()).toBe('/assets/show/9?page=2');
    expect(container.querySelector('nav[aria-label="Pages of this folder"]')?.textContent).toContain('Page 2 of 2');
    expect(container.textContent).not.toContain('No files');
  });

  it('shows the server message when the folder cannot be read', async () => {
    fetchJson.mockRejectedValue(Object.assign(new Error('Not found'), { name: 'ServerRequestError', status: 404 }));
    await render('/assets/show/999');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Not found');
  });
});

describe('the toolbar', () => {
  it('keeps the folder and page when it switches to the list and back', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { ...readBody.children, pageInfo: { totalCount: 120 } } });
    await render('/assets/show/9?page=2');
    await click(buttonNamed('List view'));
    expect(location()).toBe('/assets/show/9?view=list&page=2');
    await click(buttonNamed('Gallery view'));
    expect(location()).toBe('/assets/show/9?page=2');
  });

  it('sorts the gallery from its menu, back at the first page', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { ...readBody.children, pageInfo: { totalCount: 120 } } });
    await render('/assets/show/9?page=2');
    expect(container.querySelector('#Files_Sort')?.textContent).toContain('Sort: Title A-Z');
    await click(container.querySelector('#Files_Sort'));
    await click(buttonNamed('Newest'));
    expect(location()).toBe('/assets/show/9?sort=-lastEdited');
    expect(fetchJson).toHaveBeenLastCalledWith('https://cms.test/admin/assets/api/read/9?page=1&sort=lastEdited%2Cdesc', expect.anything());
    expect(container.querySelector('#Files_Sort')?.textContent).toContain('Sort: Newest');
  });

  it('keeps the view and sort when it opens another folder', async () => {
    await render('/assets/show/9?view=list&sort=-title');
    await click(linkNamed('Archive'));
    expect(location()).toBe('/assets/show/12?view=list&sort=-title');
  });

  it('draws Upload and Add a folder as disabled placeholders', async () => {
    await render('/assets/show/9');
    expect([buttonNamed('Upload')?.disabled, buttonNamed('Add a folder')?.disabled]).toEqual([true, true]);
  });

  it('splits on a narrow screen where it carries the sort, in the gallery', async () => {
    await render('/assets/show/9');
    expect(container.querySelector('.files-toolbar')?.className).toBe('files-toolbar files-toolbar--sorted');
  });

  it('keeps one row without the sort, in the list', async () => {
    await render('/assets/show/9?view=list');
    expect(container.querySelector('.files-toolbar')?.className).toBe('files-toolbar');
    expect(container.querySelector('#Files_Sort')).toBeNull();
  });
});

describe('the list view', () => {
  it('lists folders before files under Title, Size and Modified', async () => {
    await render('/assets/show/9?view=list');
    expect(container.querySelector('.files-gallery')).toBeNull();
    expect(tableProps?.columns.map((column) => [column.name, column.title, Boolean(column.sortable)])).toEqual([
      ['title', 'Title', true],
      ['size', 'Size', false],
      ['modified', 'Modified', true],
    ]);
    expect(Array.from(container.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent))).toEqual([
      ['Archive', '—', 'Feb 22 2021'],
      ['WordmarkDraft', '13 KB', 'Apr 13 2023'],
    ]);
    expect(tableProps?.selection).toEqual({ selected: [] });
    expect(tableProps?.sort).toEqual({ column: 'title', direction: 'asc' });
  });

  it('opens a folder row in the list', async () => {
    await render('/assets/show/9?view=list');
    await click(container.querySelector('tr[data-id="12"]'));
    expect(location()).toBe('/assets/show/12?view=list');
  });

  it('opens a file row on the file edit route', async () => {
    await render('/assets/show/9?view=list');
    await click(container.querySelector('tr[data-id="40"]'));
    expect(location()).toBe('/assets/show/9/edit/40?view=list');
  });

  it('sorts from a column header through the same query', async () => {
    await render('/assets/show/9?view=list');
    await click(buttonNamed('Modified'));
    expect(location()).toBe('/assets/show/9?view=list&sort=-lastEdited');
  });

  it('says an empty folder is empty instead of drawing the table', async () => {
    fetchJson.mockResolvedValue({ ...readBody, children: { pageInfo: { totalCount: 0 }, nodes: [] } });
    await render('/assets/show/9?view=list');
    expect(container.textContent).toContain('No files');
    expect(tableProps).toBeNull();
  });
});

describe('list helpers', () => {
  it('maps the URL sort to the table sort and back', () => {
    expect(tableSort('-lastEdited')).toEqual({ column: 'modified', direction: 'desc' });
    expect(tableSort('title')).toEqual({ column: 'title', direction: 'asc' });
    expect(fileSort({ column: 'modified', direction: 'asc' })).toBe('lastEdited');
    expect(fileSort({ column: 'title', direction: 'desc' })).toBe('-title');
  });

  it("writes the server's date as the design's month, day and year", () => {
    expect(formatModified('2021-02-22 09:00:00')).toBe('Feb 22 2021');
    expect(formatModified(null)).toBe('');
  });
});
