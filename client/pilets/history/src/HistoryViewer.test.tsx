// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryApi, Version } from './api';
import { createHistoryViewer } from './HistoryViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const version = (number: number, flags: Partial<Version> = {}): Version => ({
  version: number,
  author: { firstName: 'Default Admin', surname: null },
  publisher: { firstName: '', surname: '' },
  deleted: false,
  draft: true,
  published: false,
  liveVersion: false,
  latestDraftVersion: false,
  lastEdited: '2026-10-07 11:40:04',
  ...flags,
});

let container: HTMLDivElement;
let root: Root;
let client: { read: ReturnType<typeof vi.fn>; revert: ReturnType<typeof vi.fn> };
let emitted: Array<[string, unknown]>;
let afterHooks: Array<[string, unknown]>;
let toasts: Array<string>;
let formUrls: Array<string>;
let queryKeys: Array<string>;
let generation: number;
let invalidated: Set<() => void>;

const requestError = (message: string, status: number) => Object.assign(new Error(message), { status });

type QueryState = { key: string; status: 'pending' | 'error' | 'success'; data: unknown; error: Error | null };

// Stands in for the shell's server cache: reads per key, and an announced change rereads every key keeping its data
function useServerQuery(key: ReadonlyArray<unknown>, fetcher: (context: { signal: AbortSignal }) => Promise<unknown>, options: { enabled?: boolean } = {}) {
  const [seen, setSeen] = React.useState(generation);
  const [state, setState] = React.useState<QueryState | null>(null);
  React.useEffect(() => {
    const listener = () => setSeen(generation);
    invalidated.add(listener);
    return () => {
      invalidated.delete(listener);
    };
  }, []);
  const serialised = JSON.stringify(key);
  React.useEffect(() => {
    if (options.enabled === false) {
      return undefined;
    }
    queryKeys.push(serialised);
    const controller = new AbortController();
    fetcher({ signal: controller.signal }).then(
      (data) => setState({ key: serialised, status: 'success', data, error: null }),
      (error: Error) => setState({ key: serialised, status: 'error', data: undefined, error }),
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised key, as the real cache is
  }, [serialised, seen]);
  const current = state?.key === serialised ? state : { status: 'pending' as const, data: undefined, error: null };
  return { status: current.status, data: current.data, error: current.error, isFetching: false, refetch: async () => undefined };
}

function useServerMutation(mutation: (variables: unknown) => Promise<unknown>, options: { changes?: (variables: unknown, result: unknown) => unknown } = {}) {
  const [status, setStatus] = React.useState<'idle' | 'pending' | 'error' | 'success'>('idle');
  return {
    status,
    error: null,
    reset: () => setStatus('idle'),
    mutate: async (variables: unknown) => {
      setStatus('pending');
      try {
        const result = await mutation(variables);
        setStatus('success');
        const change = options.changes?.(variables, result);
        if (change) {
          emitted.push(['silverstripe:records-changed', change]);
          generation += 1;
          invalidated.forEach((listener) => listener());
        }
        return result;
      } catch (error) {
        setStatus('error');
        throw error;
      }
    },
  };
}

const FakeForm = ({ schemaUrl }: { schemaUrl: string }) => {
  formUrls.push(schemaUrl);
  return <p data-form={schemaUrl}>Version form</p>;
};

const field = (data: Record<string, unknown>) =>
  ({
    id: 'Form_EditForm_PageHistory',
    name: 'PageHistory',
    data: { recordId: 1, recordClass: 'Page', isRevertable: true, limit: 2, ...data },
  }) as never;

async function render(data: Record<string, unknown> = {}) {
  const HistoryViewer = createHistoryViewer({
    api: {
      getSilverstripeComponent: () => FakeForm as never,
      showNotification: (content: unknown) => {
        toasts.push(String(content));
        return undefined as never;
      },
      useServerQuery,
      useServerMutation,
      runAfterHook: (name: string, context: unknown) => {
        afterHooks.push([name, context]);
      },
    } as never,
    client: client as unknown as HistoryApi,
    versionSchemaUrl: (recordClass, id, number) => `schema?${recordClass}/${id}/${number}`,
  });
  await act(async () => {
    root.render(<HistoryViewer {...({ field: field(data), value: undefined, onChange: () => undefined, onBlur: () => undefined, submitting: false, renderFields: () => null } as unknown as React.ComponentProps<typeof HistoryViewer>)} />);
  });
}

const buttons = () => Array.from(container.querySelectorAll('button'));
const button = (label: string) => {
  const found = buttons().find((candidate) => candidate.textContent?.trim() === label);
  if (!found) {
    throw new Error(`No button "${label}" in ${buttons().map((candidate) => candidate.textContent).join(', ')}`);
  }
  return found;
};
const click = async (label: string) => {
  await act(async () => {
    button(label).click();
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  emitted = [];
  afterHooks = [];
  toasts = [];
  formUrls = [];
  queryKeys = [];
  generation = 0;
  invalidated = new Set();
  client = {
    read: vi.fn(async (_class: string, _id: number, page: number) =>
      page === 1
        ? { totalCount: 3, versions: [version(3, { published: true, latestDraftVersion: true }), version(2)] }
        : { totalCount: 3, versions: [version(1, { deleted: true })] },
    ),
    revert: vi.fn(async () => undefined),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('HistoryViewer', () => {
  it('lists versions as table rows with status badges', async () => {
    await render();

    expect(client.read).toHaveBeenCalledWith('Page', 1, 1, expect.any(AbortSignal));
    expect(queryKeys).toEqual(['["Page",1,"versions",1]']);
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.children).map((cell) => cell.textContent?.trim()),
    );
    expect(rows.map((row) => row.slice(0, 3))).toEqual([
      ['Version 3', 'Published', 'Default Admin'],
      ['Version 2', 'Draft', 'Default Admin'],
    ]);
  });

  it('opens a version read-only, focuses its heading, and returns focus to its row', async () => {
    await render();
    await click('Version 2');

    expect(formUrls[formUrls.length - 1]).toBe('schema?Page/1/2');
    expect(document.activeElement?.textContent).toContain('Version 2');
    expect(container.querySelector('table')).toBeNull();

    await click('Back to all versions');
    expect(document.activeElement?.id).toBe('Form_EditForm_PageHistory_version_2');
  });

  it('offers revert for an older version only, reverts through the client and runs onAfterRevert', async () => {
    await render();
    await click('Version 3');
    expect(buttons().map((candidate) => candidate.textContent)).not.toContain('Revert to this version');
    expect(container.textContent).toContain('Revert is unavailable for the current version');

    await click('Back to all versions');
    await click('Version 2');
    await click('Revert to this version');

    expect(client.revert).toHaveBeenCalledWith('Page', 1, 2);
    expect(toasts).toEqual(['Reverted to version 2']);
    expect(emitted).toEqual([['silverstripe:records-changed', { recordClass: 'Page', ids: [1] }]]);
    expect(afterHooks).toEqual([['onAfterRevert', { recordClass: 'Page', id: 1, version: 2 }]]);
    expect(client.read).toHaveBeenCalledTimes(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('Versions');
  });

  it('shows no revert to a member who cannot edit', async () => {
    await render({ isRevertable: false });
    await click('Version 2');
    expect(buttons().map((candidate) => candidate.textContent)).not.toContain('Revert to this version');
    expect(container.textContent).not.toContain('Revert is unavailable');
  });

  it('shows a failed revert in the version view and stays there', async () => {
    client.revert.mockRejectedValueOnce(requestError('You do not have permission', 403));
    await render();
    await click('Version 2');
    await click('Revert to this version');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('You do not have permission');
    expect(button('Revert to this version')).toBeTruthy();
    expect(emitted).toEqual([]);
    expect(afterHooks).toEqual([]);
  });

  it('shows a failed read as an alert', async () => {
    client.read.mockRejectedValueOnce(requestError('Sorry, it seems there was a 404 error.', 404));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Sorry, it seems there was a 404 error.');
  });
});
