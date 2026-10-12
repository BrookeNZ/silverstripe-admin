// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { DataTableProps, FormSchemaFormProps, FormSchemaState, PageComponentProps, PanelOptions } from '@silverstripe/admin-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileClass } from './api';
import { filePanelId } from './FileDetails';
import { createFileRedirect } from './FileRedirect';
import { createFilesSection } from './FilesSection';
import type { FilesSectionOptions } from './FilesSection';
import { fileDetails, fileSpecs, fileTitle, panelOmittedFields } from './fileState';
import { fileEditPath, readFileRoute } from './paths';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const schemaUrl = 'admin/assets/schema/fileEditForm/';
const options: FilesSectionOptions = {
  routePrefix: '/assets',
  sectionTitle: 'Files',
  readEndpoint: 'https://cms.test/admin/assets/api/read/',
  fileEditSchemaUrl: schemaUrl,
};

const formState = (title: string, parentId = 9): FormSchemaState => ({
  id: 'Form_fileEditForm_40',
  messages: [],
  fields: [
    { name: 'Title', id: 'Title', value: title, message: null, data: [] },
    { name: 'Name', id: 'Name', value: 'wordmark.png', message: null, data: [] },
    { name: 'FileSpecs', id: 'FileSpecs', value: '<div class="editor__specs">1120x640px 13 KB </div>', message: null, data: [] },
    { name: 'ParentID', id: 'ParentID', value: parentId, message: null, data: [] },
    {
      name: 'PreviewImage',
      id: 'PreviewImage',
      value: null,
      message: null,
      data: { url: '/assets/wordmark.png', preview: '/assets/wordmark__Fit.png', version: 3, exists: true, category: 'image', initialValues: { FileFilename: 'Brand/wordmark.png' } },
    },
  ],
});

describe('file routes', () => {
  it('reads the folder and the file from the route, the file only when it is an id', () => {
    expect(readFileRoute({ folderId: '9', fileId: '40' })).toEqual({ folderId: 9, fileId: 40 });
    expect(readFileRoute({ folderId: '9' })).toEqual({ folderId: 9, fileId: null });
    expect(readFileRoute({ folderId: '0', fileId: '0' })).toEqual({ folderId: 0, fileId: null });
    expect(readFileRoute({ folderId: 'x', fileId: 'y' })).toEqual({ folderId: 0, fileId: null });
  });

  it('keeps the folder query on a file path', () => {
    expect(fileEditPath('/assets', 9, 40)).toBe('/assets/show/9/edit/40');
    expect(fileEditPath('/assets', 0, 40, { view: 'list', sort: '-lastEdited', page: 2 })).toBe('/assets/show/0/edit/40?view=list&sort=-lastEdited&page=2');
  });
});

describe('file state', () => {
  it('reads the title, specs, preview and folder the panel shows', () => {
    const details = fileDetails(formState('Wordmark'), 'https://cms.test/');
    expect(details).toEqual({
      title: 'Wordmark',
      meta: ['1120 x 640px', '13 KB'],
      preview: {
        src: 'https://cms.test/assets/wordmark__Fit.png?vid=3',
        href: 'https://cms.test/assets/wordmark.png?vid=3',
        isImage: true,
        exists: true,
        filename: 'Brand/wordmark.png',
      },
      parentId: 9,
    });
    expect(fileTitle(formState(' '))).toBe('wordmark.png');
  });

  it('reads the size alone for a file without dimensions', () => {
    expect(fileSpecs('<div class="editor__specs">2 MB </div>')).toEqual(['2 MB']);
    expect(fileSpecs(null)).toEqual([]);
  });
});

let container: HTMLDivElement;
let root: Root;
let fetchJson: ReturnType<typeof vi.fn>;
let panel: PanelOptions | null;
let panelListeners: Set<() => void>;
let recordsListeners: Set<(event: { recordClass?: unknown; ids: Array<number> }) => void>;
let titles: Array<string>;
let reportsState: boolean;

function setPanel(next: PanelOptions | null) {
  panel = next;
  panelListeners.forEach((listener) => listener());
}

/** Stands in for the shell's panel region: draws the content the page passes and its close button */
const PanelRegion = () => {
  const current = React.useSyncExternalStore(
    (listener) => {
      panelListeners.add(listener);
      return () => panelListeners.delete(listener);
    },
    () => panel,
  );
  return current ? (
    <section aria-label={current.title} data-testid="panel">
      <button type="button" onClick={current.onClose}>
        {current.closeLabel}
      </button>
      {current.content}
    </section>
  ) : null;
};

/** The shell's server cache in miniature: a read whose `records` lists a changed id refetches */
function useServerQuery(
  key: ReadonlyArray<unknown>,
  fetcher: (context: { signal: AbortSignal; request: typeof fetchJson }) => Promise<unknown>,
  queryOptions?: { records?: (data: unknown) => ReadonlyArray<number> },
) {
  const serialised = JSON.stringify(key);
  const [state, setState] = React.useState<{ key: string; data?: unknown; error?: unknown } | null>(null);
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    fetcher({ signal: controller.signal, request: fetchJson }).then(
      (data) => setState({ key: serialised, data }),
      (error: unknown) => setState({ key: serialised, error }),
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised key, as the real cache is
  }, [serialised, version]);
  const current = state?.key === serialised ? state : null;
  const shown = current?.data;
  React.useEffect(() => {
    const listener = (event: { recordClass?: unknown; ids: Array<number> }) => {
      const records = shown !== undefined ? (queryOptions?.records?.(shown) ?? []) : [];
      // As the real cache: an event naming no class is dropped, and a class matches its ancestors' keys
      const related = typeof event.recordClass === 'string' && (event.recordClass === key[0] || recordClassAncestry[event.recordClass]?.includes(String(key[0])));
      if (related && event.ids.some((id) => records.includes(id))) {
        setVersion((count) => count + 1);
      }
    };
    recordsListeners.add(listener);
    return () => {
      recordsListeners.delete(listener);
    };
  });
  return {
    status: current ? (current.error ? 'error' : 'success') : 'pending',
    data: current?.data,
    error: current?.error ?? null,
    isFetching: false,
    refetch: async () => current?.data,
  };
}

const recordClassAncestry: Record<string, Array<string>> = { 'SilverStripe\\Assets\\Image': [fileClass, 'SilverStripe\\ORM\\DataObject'] };

// AssetAdmin's own answers: the save's record names no class, and the shell's schema names the form's record class
const fileEditSchema = { recordClass: 'SilverStripe\\Assets\\Image' };
const saveResponse = { id: 'Form_fileEditForm_40', record: { id: 40, title: 'Wordmark (final)' } as { id: number; title: string; className?: string } };

/**
 * Stands in for the shell's FormSchemaForm: reports its state, and Save announces the saved record under the
 * class the shell's form uses (the record's, else the schema's; FormSchemaForm.messages.test.tsx runs the real one)
 */
const FormSchemaForm = ({ schemaUrl: url, onStateChange, onSubmitted, omitFields }: FormSchemaFormProps) => {
  const [title, setTitle] = React.useState('Wordmark');
  React.useEffect(() => {
    if (reportsState) {
      onStateChange?.(formState(title));
    }
  }, [title, onStateChange]);
  return (
    <form data-url={url} data-omitted={omitFields?.join(',')}>
      <button
        type="button"
        onClick={() => {
          setTitle('Wordmark (final)');
          onSubmitted?.({ id: 'Form_fileEditForm_40' }, { name: 'action_save', title: 'Save' } as Parameters<NonNullable<FormSchemaFormProps['onSubmitted']>>[1]);
          const recordClass = saveResponse.record.className || fileEditSchema.recordClass;
          recordsListeners.forEach((listener) => listener({ recordClass, ids: [saveResponse.record.id] }));
        }}
      >
        Save
      </button>
    </form>
  );
};

const readBody = (title: string) => ({
  id: 9,
  title: 'Logos',
  ancestors: [],
  children: {
    pageInfo: { totalCount: 1 },
    nodes: [{ id: 40, title, type: 'file', category: 'image', extension: 'png', thumbnail: '/assets/wordmark.png', size: '13 KB', lastEdited: '2023-04-13 10:30:00', draft: true }],
  },
});

// Stands in for the shell's DataTable, which has its own tests: the cells in rows
const DataTable = ({ rows, columns, currentRowId }: DataTableProps) => (
  <table>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} aria-current={row.id === currentRowId ? 'true' : undefined}>
          {columns.map((column) => (
            <td key={column.name}>{row.cells[column.name]}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const components: Record<string, React.ComponentType<never>> = { FormSchemaForm, DataTable };

const piral = {
  useServerQuery,
  getSilverstripeComponent: (name: string) => components[name] ?? (() => null),
  setSectionHeader: () => () => undefined,
  showNotification: (message: string) => titles.push(message),
  openPanel: (next: PanelOptions) => {
    setPanel(next);
    return () => {
      queueMicrotask(() => {
        if (panel === next) {
          setPanel(null);
        }
      });
    };
  },
} as unknown as PageComponentProps['piral'];

const Location = () => <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;
const location = () => container.querySelector('[data-testid="location"]')?.textContent;

const render = async (path: string) => {
  const Page = createFilesSection(options);
  const Redirect = createFileRedirect({ routePrefix: '/assets', sectionTitle: 'Files', schemaUrl });
  const page = <Page piral={piral} {...({} as Omit<PageComponentProps, 'piral'>)} />;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/assets" element={page} />
          <Route path="/assets/show/:folderId" element={page} />
          <Route path="/assets/show/:folderId/edit/:fileId" element={page} />
          <Route path="/assets/edit/:id" element={<Redirect piral={piral} />} />
        </Routes>
        <Location />
        <PanelRegion />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await Promise.resolve();
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  panel = null;
  panelListeners = new Set();
  recordsListeners = new Set();
  titles = [];
  reportsState = true;
  fetchJson = vi.fn().mockResolvedValue(readBody('Wordmark'));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the file details panel', () => {
  it('opens the file named by the route with its title, badge and specs, and marks its tile', async () => {
    await render('/assets/show/9/edit/40');
    expect(panel?.id).toBe(filePanelId(40));
    expect(panel?.title).toBe('Wordmark');
    expect(panel?.badge).toBe('Draft');
    expect(panel?.meta).toEqual(['1120 x 640px', '13 KB']);
    const form = container.querySelector('[data-testid="panel"] form');
    expect(form?.getAttribute('data-url')).toBe('admin/assets/schema/fileEditForm/40');
    expect(form?.getAttribute('data-omitted')).toBe(panelOmittedFields.join(','));
    expect(container.querySelector('.files-preview__image')?.getAttribute('src')).toContain('wordmark__Fit.png?vid=3');
    const tile = container.querySelector('.files-tile--active');
    expect(tile?.querySelector('a')?.getAttribute('aria-current')).toBe('true');
    expect(panel?.returnFocus?.()).toBe(tile?.querySelector('a'));
  });

  it('closes back to the folder with the view, sort and page it was opened from', async () => {
    const body = readBody('Wordmark');
    fetchJson.mockResolvedValue({ ...body, children: { ...body.children, pageInfo: { totalCount: 120 } } });
    await render('/assets/show/9/edit/40?view=list&sort=-title&page=2');
    expect(container.querySelector('tr[aria-current="true"] a')?.textContent).toBe('Wordmark');
    expect(container.querySelector('a[aria-current]')).toBeNull();
    await click(container.querySelector('[data-testid="panel"] button'));
    expect(location()).toBe('/assets/show/9?view=list&sort=-title&page=2');
    expect(panel).toBeNull();
  });

  it('shows a saved title on the row and in the panel, through the records-changed refetch', async () => {
    await render('/assets/show/9/edit/40?view=list');
    fetchJson.mockResolvedValue(readBody('Wordmark (final)'));
    const save = Array.from(container.querySelectorAll('[data-testid="panel"] button')).find((button) => button.textContent === 'Save');
    await click(save);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.files-table__link')?.textContent).toBe('Wordmark (final)');
    expect(panel?.title).toBe('Wordmark (final)');
    expect(titles).toEqual(['Save succeeded']);
  });

  it('titles the panel neutrally until the file is known', async () => {
    reportsState = false;
    fetchJson.mockReturnValue(new Promise(() => undefined));
    await render('/assets/show/9/edit/19');
    expect(panel?.title).toBe('File details');
  });

  it('keeps the file open when the view changes', async () => {
    await render('/assets/show/9/edit/40');
    await click(container.querySelector('button[aria-label="List view"]'));
    expect(location()).toBe('/assets/show/9/edit/40?view=list');
    expect(panel?.id).toBe(filePanelId(40));
  });
});

describe('the former file edit route', () => {
  it('redirects to the file in its folder, read from the form state', async () => {
    fetchJson.mockResolvedValue({ id: 'Form_fileEditForm_40', state: formState('Wordmark', 9) });
    await render('/assets/edit/40');
    expect(fetchJson.mock.calls[0]).toEqual([
      'admin/assets/schema/fileEditForm/40',
      expect.objectContaining({ headers: { 'X-Formschema-Request': 'state' }, query: { formSchema: 1 } }),
    ]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(location()?.startsWith('/assets/show/9/edit/40')).toBe(true);
  });

  it('shows the server message when the file cannot be read', async () => {
    fetchJson.mockRejectedValue(new Error('File not found'));
    await render('/assets/edit/404');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('File not found');
    expect(location()).toBe('/assets/edit/404');
  });
});
