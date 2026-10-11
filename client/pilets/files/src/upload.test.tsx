// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PageComponentProps } from '@silverstripe/admin-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUpload, createFile } from './createFile';
import { createFilesSection } from './FilesSection';
import type { FilesSectionOptions } from './FilesSection';
import { resetUploads } from './uploadQueue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: FormData;
  request: FakeRequest;
}

let sent: Array<Sent>;

// Stands in for XMLHttpRequest, the boundary createFile posts through; a test answers each request it sent
class FakeRequest {
  status = 0;
  responseText = '';
  withCredentials = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private method = '';
  private url = '';
  private headers: Record<string, string> = {};

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: FormData) {
    sent.push({ method: this.method, url: this.url, headers: this.headers, body, request: this });
  }

  abort() {
    this.onabort?.();
  }

  answer(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const endpoint = 'https://cms.test/admin/assets/api/createFile';
const rules = { maxFilesize: 1, filesizeBase: 1024, acceptedFiles: '.jpg,.png,.pdf' };

const fileOf = (name: string, size = 10, type = '') => new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  sent = [];
  vi.stubGlobal('XMLHttpRequest', FakeRequest);
  (window as { ss?: unknown }).ss = { config: { SecurityID: 'csrf-token', sections: [] } };
});

afterEach(() => {
  resetUploads();
  vi.unstubAllGlobals();
});

describe('createFile', () => {
  it('posts the file as Upload with ParentID and the token, as a field and a header', async () => {
    const file = fileOf('logo.png');
    const created = createFile({ endpoint, file, folderId: 9, securityId: 'csrf-token' });
    const [request] = sent;
    expect([request.method, request.url]).toEqual(['POST', endpoint]);
    expect(request.body.get('Upload')).toBeInstanceOf(File);
    expect((request.body.get('Upload') as File).name).toBe('logo.png');
    expect(request.body.get('ParentID')).toBe('9');
    expect(request.body.get('SecurityID')).toBe('csrf-token');
    expect(request.headers['X-SecurityID']).toBe('csrf-token');
    request.request.answer(200, [{ id: 41, title: 'Logo' }]);
    await expect(created).resolves.toEqual({ id: 41, title: 'Logo' });
  });

  it("rejects with the error envelope's message", async () => {
    const created = createFile({ endpoint, file: fileOf('logo.png'), folderId: 9, securityId: 'csrf-token' });
    sent[0].request.answer(400, { status: 'error', errors: [{ type: 'error', code: 400, value: 'Extension is not allowed' }] });
    await expect(created).rejects.toMatchObject({ name: 'UploadError', status: 400, message: 'Extension is not allowed' });
  });
});

describe('checkUpload', () => {
  it('refuses a file over the limit and a type not accepted, in legacy words', () => {
    expect(checkUpload(fileOf('big.png', 1024 * 1024 + 1), rules)).toBe('File is too big. Max filesize: 1MiB.');
    expect(checkUpload(fileOf('run.exe'), rules)).toBe("You can't upload files of this type.");
    expect(checkUpload(fileOf('LOGO.PNG'), rules)).toBeNull();
    expect(checkUpload(fileOf('anything.exe', 5 * 1024 * 1024), {})).toBeNull();
  });
});

let container: HTMLDivElement;
let root: Root;
let notifications: Array<{ message: string; type?: string }>;
let invalidated: Array<[string, ReadonlyArray<number>]>;

const readBody = {
  id: 9,
  title: 'Logos',
  canEdit: true,
  ancestors: [],
  children: { pageInfo: { totalCount: 0 }, nodes: [] },
};

// Stands in for the shell's server cache, which has its own tests
function useServerQuery(key: ReadonlyArray<unknown>, fetcher: (context: { signal: AbortSignal; request: () => Promise<unknown> }) => Promise<unknown>) {
  const [data, setData] = React.useState<unknown>(undefined);
  const serialised = JSON.stringify(key);
  React.useEffect(() => {
    void fetcher({ signal: new AbortController().signal, request: async () => readBody }).then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised key, as the real cache is
  }, [serialised]);
  return { status: data ? 'success' : 'pending', data, error: null, isFetching: false, refetch: async () => data };
}

const piral = {
  useServerQuery,
  getSilverstripeComponent: () => () => null,
  setSectionHeader: () => () => undefined,
  showNotification: (message: string, options?: { type?: string }) => {
    notifications.push({ message, type: options?.type });
    return () => undefined;
  },
  invalidateRecords: (recordClass: string, ids: ReadonlyArray<number>) => invalidated.push([recordClass, ids]),
} as unknown as PageComponentProps['piral'];

const options: FilesSectionOptions = {
  routePrefix: '/assets',
  sectionTitle: 'Files',
  readEndpoint: 'https://cms.test/admin/assets/api/read/',
  createFileEndpoint: endpoint,
  uploadRules: rules,
};

const Location = () => <output data-testid="location">{useLocation().pathname}</output>;

const render = async () => {
  const Page = createFilesSection(options);
  const page = <Page piral={piral} {...({} as Omit<PageComponentProps, 'piral'>)} />;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/assets/show/9']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/assets/show/:folderId" element={page} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
  });
};

const pick = async (...files: Array<File>) => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const buttonNamed = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name);

const tileText = () => Array.from(container.querySelectorAll('.files-tile')).map((tile) => tile.textContent);

describe('uploading into the folder', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    notifications = [];
    invalidated = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('opens the file picker from Upload, accepting the allowed types', async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const click = vi.spyOn(input as HTMLInputElement, 'click');
    await act(async () => buttonNamed('Upload')?.click());
    expect(buttonNamed('Upload')?.disabled).toBe(false);
    expect(click).toHaveBeenCalled();
    expect([input?.multiple, input?.accept]).toEqual([true, '.jpg,.png,.pdf']);
  });

  it('stops an oversize file and a refused type before posting, and says why', async () => {
    await render();
    await pick(fileOf('huge.png', 2 * 1024 * 1024), fileOf('run.exe'));
    expect(sent).toHaveLength(0);
    expect(tileText()).toEqual(['File is too big. Max filesize: 1MiB.huge.png', "You can't upload files of this type.run.exe"]);
    expect(notifications).toEqual([
      { message: 'huge.png: File is too big. Max filesize: 1MiB.', type: 'error' },
      { message: "run.exe: You can't upload files of this type.", type: 'error' },
    ]);
    expect(buttonNamed('Remove run.exe')).toBeDefined();
  });

  it("shows a server 400's message on the tile and in an error toast", async () => {
    await render();
    await pick(fileOf('logo.png'));
    expect(sent).toHaveLength(1);
    expect(buttonNamed('Cancel upload of logo.png')).toBeDefined();
    await act(async () => sent[0].request.answer(400, { status: 'error', errors: [{ type: 'error', code: 400, value: 'Filename is too long' }] }));
    expect(tileText()).toEqual(['Filename is too longlogo.png']);
    expect(notifications[notifications.length - 1]).toEqual({ message: 'logo.png: Filename is too long', type: 'error' });
    expect(invalidated).toEqual([]);
  });

  it('shows a 403 from the server', async () => {
    await render();
    await pick(fileOf('logo.png'));
    await act(async () =>
      sent[0].request.answer(403, { status: 'error', errors: [{ type: 'error', code: 403, value: 'You do not have permission to add files' }] }),
    );
    expect(tileText()).toEqual(['You do not have permission to add fileslogo.png']);
    expect(notifications[notifications.length - 1]).toEqual({ message: 'logo.png: You do not have permission to add files', type: 'error' });
  });

  it('cancels an upload by its named button and puts focus on Upload', async () => {
    await render();
    await pick(fileOf('logo.png'));
    const aborted = vi.spyOn(sent[0].request, 'abort');
    await act(async () => buttonNamed('Cancel upload of logo.png')?.click());
    expect(aborted).toHaveBeenCalled();
    expect(tileText()).toEqual([]);
    expect(document.activeElement).toBe(buttonNamed('Upload'));
  });

  it('refetches the folder and opens the last file once the batch is done', async () => {
    await render();
    await pick(fileOf('one.png'), fileOf('two.png'), fileOf('three.png'));
    expect(sent).toHaveLength(2);
    await act(async () => sent[0].request.answer(200, [{ id: 41, title: 'One' }]));
    expect(sent).toHaveLength(3);
    await act(async () => sent[1].request.answer(200, [{ id: 42, title: 'Two' }]));
    await act(async () => sent[2].request.answer(200, [{ id: 43, title: 'Three' }]));
    expect(invalidated).toEqual([
      ['SilverStripe\\Assets\\File', [9]],
      ['SilverStripe\\Assets\\File', [9]],
      ['SilverStripe\\Assets\\File', [9]],
    ]);
    expect(notifications.map((notification) => notification.message)).toEqual(['Uploading 3 files', 'Uploaded 3 files']);
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/assets/show/9/edit/43');
  });

  it('disables Upload where the folder takes no new files', async () => {
    readBody.canEdit = false;
    try {
      await render();
      expect(buttonNamed('Upload')?.disabled).toBe(true);
    } finally {
      readBody.canEdit = true;
    }
  });
});
