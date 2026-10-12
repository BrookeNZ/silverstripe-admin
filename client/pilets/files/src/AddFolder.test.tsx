// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { FormSchemaResponse, PageComponentProps, SchemaFormDialogProps } from '@silverstripe/admin-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createdFolderId, folderCreateSchemaUrl } from './AddFolder';
import { createFilesSection } from './FilesSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options = {
  routePrefix: '/assets',
  sectionTitle: 'Files',
  readEndpoint: 'https://cms.test/admin/assets/api/read/',
  folderCreateSchemaUrl: 'admin/assets/schema/folderCreateForm/',
};

// AssetAdmin::createfolder: the new folder's schema, with the folder as `record` (getObjectFromData)
const created = {
  id: 'admin/assets/schema/folderCreateForm/77',
  record: { id: 77, parent: { id: 9 }, title: 'Press', type: 'folder' },
} as unknown as FormSchemaResponse;

type Outcome = { ok: true; response: FormSchemaResponse } | { ok: false; message: string };

let container: HTMLDivElement;
let root: Root;
let post: ReturnType<typeof vi.fn<(schemaUrl: string) => Promise<Outcome>>>;
let invalidateRecords: ReturnType<typeof vi.fn>;
let dialogProps: (SchemaFormDialogProps & { omitFields?: ReadonlyArray<string> }) | null;

// Stands in for the shell's SchemaFormDialog, which has its own tests: hands over an accepted post, shows a refused one
const FakeDialog = (props: SchemaFormDialogProps & { omitFields?: ReadonlyArray<string> }) => {
  dialogProps = props;
  const [error, setError] = React.useState<string | null>(null);
  if (!props.open) {
    return null;
  }
  const create = async () => {
    const outcome = await post(props.schemaUrl);
    if (outcome.ok) {
      props.onSubmitted?.(outcome.response, { name: 'action_createfolder' } as never);
    } else {
      setError(outcome.message);
    }
  };
  return (
    <div role="dialog" aria-label={String(props.header)}>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={props.onClose}>
        Cancel
      </button>
      <button type="button" onClick={() => void create()}>
        Create
      </button>
    </div>
  );
};

let readBody: Record<string, unknown>;

// Stands in for the shell's server cache, as FilesSection.test.tsx does
function useServerQuery(key: ReadonlyArray<unknown>, fetcher: (context: { signal: AbortSignal; request: () => Promise<unknown> }) => Promise<unknown>) {
  const serialised = JSON.stringify(key);
  const [state, setState] = React.useState<{ key: string; data: unknown } | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    void fetcher({ signal: controller.signal, request: async () => readBody }).then((data) => setState({ key: serialised, data }));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised key, as the real cache is
  }, [serialised]);
  const data = state?.key === serialised ? state.data : undefined;
  return { status: data ? 'success' : 'pending', data, error: null, isFetching: false, refetch: async () => data };
}

const Location = () => <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;

const render = async (path: string, sectionOptions = options) => {
  const piral = {
    useServerQuery,
    invalidateRecords,
    getSilverstripeComponent: (name: string) => (name === 'SchemaFormDialog' ? FakeDialog : () => null),
    setSectionHeader: () => () => undefined,
  } as unknown as PageComponentProps['piral'];
  const Page = createFilesSection(sectionOptions);
  const page = <Page piral={piral} {...({} as Omit<PageComponentProps, 'piral'>)} />;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/assets" element={page} />
          <Route path="/assets/show/:folderId" element={page} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
  });
};

const location = () => container.querySelector('[data-testid="location"]')?.textContent;
const buttonNamed = (name: string) => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === name);
const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  dialogProps = null;
  invalidateRecords = vi.fn();
  post = vi.fn();
  readBody = { id: 9, title: 'Logos', canEdit: true, ancestors: [], children: { pageInfo: { totalCount: 0 }, nodes: [] } };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Add a folder', () => {
  it('builds the form URL for the parent and reads the new folder from the response', () => {
    expect(folderCreateSchemaUrl('admin/assets/schema/folderCreateForm', 0)).toBe('admin/assets/schema/folderCreateForm/0');
    expect(folderCreateSchemaUrl('admin/assets/schema/folderCreateForm/', 9)).toBe('admin/assets/schema/folderCreateForm/9');
    expect(createdFolderId(created)).toBe(77);
    expect(createdFolderId({ id: 'x' } as FormSchemaResponse)).toBeNull();
  });

  it("opens the open folder's create form without the header group and preview the dialog replaces", async () => {
    await render('/assets/show/9?view=list');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(buttonNamed('Add a folder'));
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('New folder');
    expect(dialogProps?.schemaUrl).toBe('admin/assets/schema/folderCreateForm/9');
    expect(dialogProps?.omitFields).toEqual(['AssetEditorHeaderFieldGroup', 'PreviewImage']);
  });

  it('posts, then refreshes the parent and opens the new folder keeping the view and sort', async () => {
    post.mockResolvedValue({ ok: true, response: created });
    await render('/assets/show/9?view=list&sort=-title&page=2');
    await click(buttonNamed('Add a folder'));
    await click(buttonNamed('Create'));
    expect(post).toHaveBeenCalledWith('admin/assets/schema/folderCreateForm/9');
    expect(invalidateRecords).toHaveBeenCalledWith('SilverStripe\\Assets\\File', [9]);
    expect(location()).toBe('/assets/show/77?view=list&sort=-title');
    expect(dialogProps?.open).toBe(false);
  });

  it.each([
    ['a validation error', '"Folder name" is required'],
    ['a refused post', 'The form endpoint answered 403'],
  ])('keeps the dialog open on the folder after %s', async (_case, message) => {
    post.mockResolvedValue({ ok: false, message });
    await render('/assets/show/9');
    await click(buttonNamed('Add a folder'));
    await click(buttonNamed('Create'));
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(message);
    expect(invalidateRecords).not.toHaveBeenCalled();
    expect(location()).toBe('/assets/show/9');
  });

  it('closes on Cancel without posting', async () => {
    await render('/assets/show/9');
    await click(buttonNamed('Add a folder'));
    await click(buttonNamed('Cancel'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('is disabled in a folder the member cannot edit, and without the form', async () => {
    readBody = { ...readBody, canEdit: false };
    await render('/assets/show/9');
    expect(buttonNamed('Add a folder')?.disabled).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    readBody = { ...readBody, canEdit: true };
    await render('/assets/show/9', { ...options, folderCreateSchemaUrl: '' });
    expect(buttonNamed('Add a folder')?.disabled).toBe(true);
  });

  it("follows the root's canEdit and opens the top level's form", async () => {
    readBody = { id: 0, title: null, canEdit: false, children: { pageInfo: { totalCount: 0 }, nodes: [] } };
    await render('/assets');
    expect(buttonNamed('Add a folder')?.disabled).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    readBody = { ...readBody, canEdit: true };
    await render('/assets');
    await click(buttonNamed('Add a folder'));
    expect(dialogProps?.schemaUrl).toBe('admin/assets/schema/folderCreateForm/0');
  });
});
