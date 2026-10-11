// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { recordsChangedEvent } from '../events';
import { createServerCacheApi, createServerQueryClient, matchesRecordsChanged } from './serverCache';
import type {
  ServerCacheApi,
  ServerMutationResult,
  ServerQueryContext,
  ServerQueryFetcher,
  ServerQueryKey,
  ServerQueryOptions,
  ServerQueryResult,
} from './serverCache';
import { resetSharedConfig } from './sharedState';
import { ServerRequestError } from './serverRequest';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import type { FakeGlobalContext } from '../test/fakeGlobalContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let context: FakeGlobalContext;
let queryClient: QueryClient;
let api: ServerCacheApi;
let container: HTMLDivElement;
let root: Root;

const last = <T,>(list: ReadonlyArray<T>): T | undefined => list[list.length - 1];

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

interface ReaderProps<T> {
  queryKey: ServerQueryKey;
  fetcher: ServerQueryFetcher<T>;
  seen: Array<ServerQueryResult<T>>;
  options?: ServerQueryOptions<T>;
}

function Reader<T>({ queryKey, fetcher, seen, options }: ReaderProps<T>) {
  const result = api.useServerQuery(queryKey, fetcher, options);
  seen.push(result);
  return null;
}

async function render(element: React.ReactElement) {
  await act(async () => {
    root.render(element);
  });
  await flush();
}

beforeEach(() => {
  context = fakeGlobalContext();
  queryClient = createServerQueryClient();
  api = (createServerCacheApi(queryClient)(context) as (piral: unknown, meta: { name: string }) => ServerCacheApi)({}, { name: 'test-pilet' });
  container = document.createElement('div');
  root = createRoot(container);
  resetSharedConfig();
  window.ss = { config: { SecurityID: 'csrf-token', sections: [] } } as unknown as typeof window.ss;
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('matchesRecordsChanged', () => {
  const event = { recordClass: 'Page', ids: [7] };

  it('matches every schema, grid and blocks key', () => {
    expect(matchesRecordsChanged(['schema', 'admin/pages/schema/EditForm/7'], event)).toBe(true);
    expect(matchesRecordsChanged(['grid', 'Members'], event)).toBe(true);
    expect(matchesRecordsChanged(['blocks', 3], event)).toBe(true);
  });

  it('matches a record class key by id, or a list over the class', () => {
    expect(matchesRecordsChanged(['Page', 7, 'versions', 1], event)).toBe(true);
    expect(matchesRecordsChanged(['Page', 8, 'versions', 1], event)).toBe(false);
    expect(matchesRecordsChanged(['Page', 'list'], event)).toBe(true);
    expect(matchesRecordsChanged(['File', 7], event)).toBe(false);
  });

  it('matches a key whose result shows one of the records named', () => {
    const tree = 'SilverStripe\\CMS\\Model\\SiteTree';
    expect(matchesRecordsChanged([tree, 2, 'children', 1, 50], { recordClass: tree, ids: [7] }, [6, 7])).toBe(true);
    expect(matchesRecordsChanged([tree, 2, 'children', 1, 50], { recordClass: tree, ids: [8] }, [6, 7])).toBe(false);
    expect(matchesRecordsChanged([tree, 2, 'children', 1, 50], { recordClass: 'Page', ids: [7] }, [6, 7])).toBe(false);
  });

  it('matches every key of the class when the event names no ids', () => {
    expect(matchesRecordsChanged(['Page', 8], { recordClass: 'Page', ids: [] })).toBe(true);
  });

  describe('by class ancestry', () => {
    const tree = 'SilverStripe\\CMS\\Model\\SiteTree';
    const base = 'SilverStripe\\ORM\\DataObject';
    const ancestry = { Page: [tree, base], [tree]: [base], 'App\\Event': [base] };

    it('matches a key under an ancestor of the event class', () => {
      expect(matchesRecordsChanged([tree, 2, 'children', 1, 50], { recordClass: 'Page', ids: [7] }, [6, 7], ancestry)).toBe(true);
      expect(matchesRecordsChanged([tree, 7], { recordClass: 'Page', ids: [7] }, [], ancestry)).toBe(true);
      expect(matchesRecordsChanged([tree, 8], { recordClass: 'Page', ids: [7] }, [], ancestry)).toBe(false);
    });

    it('matches a key under a descendant of the event class', () => {
      expect(matchesRecordsChanged(['Page', 7, 'versions', 1], { recordClass: tree, ids: [7] }, [], ancestry)).toBe(true);
      expect(matchesRecordsChanged(['Page', 'list'], { recordClass: tree, ids: [7] }, [], ancestry)).toBe(true);
    });

    it('leaves a key under an unrelated class that shares an ancestor', () => {
      expect(matchesRecordsChanged(['App\\Event', 7], { recordClass: 'Page', ids: [7] }, [], ancestry)).toBe(false);
    });

    it('falls back to exact names for a class the map lacks', () => {
      expect(matchesRecordsChanged(['App\\Unmapped', 7], { recordClass: 'App\\Unmapped', ids: [7] }, [], ancestry)).toBe(true);
      expect(matchesRecordsChanged(['App\\Unmapped', 7], { recordClass: 'App\\OtherUnmapped', ids: [7] }, [], ancestry)).toBe(false);
    });

    it('reads the map from the client config by default', () => {
      resetSharedConfig();
      window.ss = { config: { sections: [], recordClasses: ancestry } } as unknown as typeof window.ss;
      expect(matchesRecordsChanged([tree, 7], { recordClass: 'Page', ids: [7] })).toBe(true);
    });
  });
});

describe('useServerQuery', () => {
  it('fetches a key once for two readers and hands both the data', async () => {
    const fetcher = vi.fn(async (_context: ServerQueryContext) => ['v3', 'v2']);
    const first: Array<ServerQueryResult<Array<string>>> = [];
    const second: Array<ServerQueryResult<Array<string>>> = [];
    await render(
      <>
        <Reader queryKey={['Page', 7, 'versions', 1]} fetcher={fetcher} seen={first} />
        <Reader queryKey={['Page', 7, 'versions', 1]} fetcher={fetcher} seen={second} />
      </>,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(last(first)).toMatchObject({ status: 'success', data: ['v3', 'v2'] });
    expect(last(second)?.data).toEqual(['v3', 'v2']);
  });

  it('shows initial data as the first result, with no loading state', async () => {
    const fetcher = vi.fn(async () => ['fetched']);
    const seen: Array<ServerQueryResult<Array<string>>> = [];
    await render(<Reader queryKey={['Page', 7, 'blocks']} fetcher={fetcher} seen={seen} options={{ initialData: ['initial'] }} />);

    expect(seen[0]).toMatchObject({ status: 'success', data: ['initial'] });
    expect(seen.some((result) => result.status === 'pending')).toBe(false);
  });

  it('trusts initial data for its staleTime from when it was fetched, and until a records-changed event', async () => {
    const fetcher = vi.fn(async () => ['fetched']);
    const seen: Array<ServerQueryResult<Array<string>>> = [];
    await render(
      <Reader queryKey={['shared:blocks', 3]} fetcher={fetcher} seen={seen} options={{ initialData: ['initial'], initialDataUpdatedAt: Date.now(), staleTime: 30_000 }} />,
    );
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      context.emit(recordsChangedEvent, { recordClass: 'Page', ids: [7] });
    });
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(last(seen)?.data).toEqual(['fetched']);
  });

  it('refetches behind initial data fetched longer ago than its staleTime', async () => {
    const fetcher = vi.fn(async () => ['fetched']);
    const seen: Array<ServerQueryResult<Array<string>>> = [];
    await render(
      <Reader queryKey={['shared:blocks', 3]} fetcher={fetcher} seen={seen} options={{ initialData: ['initial'], initialDataUpdatedAt: Date.now() - 30_001, staleTime: 30_000 }} />,
    );

    expect(seen[0]).toMatchObject({ status: 'success', data: ['initial'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(last(seen)?.data).toEqual(['fetched']);
  });

  it('reads the cache on a remount within its staleTime, and refetches on an event on screen or off', async () => {
    const file = 'SilverStripe\\Assets\\File';
    const listing = vi.fn(async () => [{ id: 19 }]);
    const records = (rows: Array<{ id: number }>) => rows.map((row) => row.id);
    const options = { staleTime: 30_000, keepPrevious: true, records };
    await render(<Reader queryKey={[file, 9, 'children', 'title,asc', 1]} fetcher={listing} seen={[]} options={options} />);
    await render(<></>);
    await render(<Reader queryKey={[file, 9, 'children', 'title,asc', 1]} fetcher={listing} seen={[]} options={options} />);
    expect(listing).toHaveBeenCalledTimes(1);

    await act(async () => {
      api.invalidateRecords(file, [19]);
    });
    await flush();
    expect(listing).toHaveBeenCalledTimes(2);

    await render(<></>);
    await act(async () => {
      api.invalidateRecords(file, [9]);
    });
    await render(<Reader queryKey={[file, 9, 'children', 'title,asc', 1]} fetcher={listing} seen={[]} options={options} />);
    expect(listing).toHaveBeenCalledTimes(3);
  });

  it('resolves a refetch to the data it fetched', async () => {
    let version = 0;
    const fetcher = vi.fn(async () => `v${++version}`);
    const seen: Array<ServerQueryResult<string>> = [];
    await render(<Reader queryKey={['Page', 7, 'title']} fetcher={fetcher} seen={seen} />);

    let refetched: string | undefined;
    await act(async () => {
      refetched = await last(seen)?.refetch();
    });

    expect(refetched).toBe('v2');
  });

  it('refetches the keys a records-changed event matches and leaves the rest', async () => {
    const versions = vi.fn(async () => 'versions');
    const otherPage = vi.fn(async () => 'other');
    const schema = vi.fn(async () => 'schema');
    await render(
      <>
        <Reader queryKey={['Page', 7, 'versions', 1]} fetcher={versions} seen={[]} />
        <Reader queryKey={['Page', 8, 'versions', 1]} fetcher={otherPage} seen={[]} />
        <Reader queryKey={['shared:schema', 'admin/pages/EditForm/7']} fetcher={schema} seen={[]} />
      </>,
    );

    await act(async () => {
      api.invalidateRecords('Page', [7]);
    });
    await flush();

    expect(context.emitted).toEqual([{ recordClass: 'Page', ids: [7] }]);
    expect(versions).toHaveBeenCalledTimes(2);
    expect(schema).toHaveBeenCalledTimes(2);
    expect(otherPage).toHaveBeenCalledTimes(1);
  });

  it('refetches a listing when an event names a record its result shows', async () => {
    const tree = 'SilverStripe\\CMS\\Model\\SiteTree';
    const children = vi.fn(async () => [{ id: 6 }, { id: 7 }]);
    const records = (rows: Array<{ id: number }>) => rows.map((row) => row.id);
    await render(<Reader queryKey={[tree, 2, 'children', 1, 50]} fetcher={children} seen={[]} options={{ records }} />);

    await act(async () => {
      api.invalidateRecords(tree, [9]);
    });
    await flush();
    expect(children).toHaveBeenCalledTimes(1);

    await act(async () => {
      api.invalidateRecords(tree, [7]);
    });
    await flush();
    expect(children).toHaveBeenCalledTimes(2);
  });

  it('refetches a base-class listing showing a record when an event names the record under its subclass', async () => {
    const tree = 'SilverStripe\\CMS\\Model\\SiteTree';
    resetSharedConfig();
    window.ss = { config: { sections: [], recordClasses: { Page: [tree] } } } as unknown as typeof window.ss;
    const children = vi.fn(async () => [{ id: 6 }, { id: 7 }]);
    const versions = vi.fn(async () => 'versions');
    const records = (rows: Array<{ id: number }>) => rows.map((row) => row.id);
    await render(
      <>
        <Reader queryKey={[tree, 2, 'children', 1, 50]} fetcher={children} seen={[]} options={{ records }} />
        <Reader queryKey={['Page', 6, 'versions', 1]} fetcher={versions} seen={[]} />
      </>,
    );

    await act(async () => {
      api.invalidateRecords('Page', [7]);
    });
    await flush();
    expect(children).toHaveBeenCalledTimes(2);
    expect(versions).toHaveBeenCalledTimes(1);

    await act(async () => {
      api.invalidateRecords(tree, [6]);
    });
    await flush();
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('refetches on an event another emitter sends, as the shell listens to the event itself', async () => {
    const versions = vi.fn(async () => 'versions');
    await render(<Reader queryKey={['Page', 7, 'versions', 1]} fetcher={versions} seen={[]} />);

    await act(async () => {
      context.emit(recordsChangedEvent, { recordClass: 'Page', ids: [7] });
    });
    await flush();

    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('reports a failed read without retrying a client error', async () => {
    const fetcher = vi.fn(async () => {
      throw new ServerRequestError('Record not found', 404);
    });
    const seen: Array<ServerQueryResult<unknown>> = [];
    await render(<Reader queryKey={['Page', 9]} fetcher={fetcher} seen={seen} />);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(last(seen)).toMatchObject({ status: 'error', data: undefined });
    expect(last(seen)?.error?.message).toBe('Record not found');
  });

  it('reads through the shell fetch, so an ended session surfaces as such', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    const seen: Array<ServerQueryResult<unknown>> = [];
    await render(<Reader queryKey={['Page', 7]} fetcher={({ request, signal }) => request('https://example.test/admin/read', { signal })} seen={seen} />);

    expect(last(seen)?.error).toMatchObject({ status: 401, sessionExpired: true });
  });
});

describe('useServerMutation', () => {
  let mutation: ServerMutationResult<number, null> | undefined;

  const Writer = ({ changes = true }: { changes?: boolean }) => {
    mutation = api.useServerMutation(
      (toVersion: number, request) => request<null>('/admin/revert', { method: 'POST', body: { id: 7, toVersion } }),
      changes ? { changes: () => ({ recordClass: 'Page', ids: [7] }) } : {},
    );
    return null;
  };

  it('posts with the CSRF token and invalidates the records it changed', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const versions = vi.fn(async () => 'versions');
    await render(
      <>
        <Writer />
        <Reader queryKey={['Page', 7, 'versions', 1]} fetcher={versions} seen={[]} />
      </>,
    );

    await act(async () => {
      await mutation?.mutate(2);
    });
    await flush();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-SecurityID']).toBe('csrf-token');
    expect(context.emitted).toEqual([{ recordClass: 'Page', ids: [7] }]);
    expect(versions).toHaveBeenCalledTimes(2);
    expect(mutation?.status).toBe('success');
  });

  it('rejects with the error, holds it, and announces nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ value: 'Nope' }] }), { status: 403, headers: { 'Content-Type': 'application/json' } })));
    await render(<Writer />);

    await act(async () => {
      await expect(mutation?.mutate(2)).rejects.toMatchObject({ message: 'Nope', status: 403 });
    });
    await flush();

    expect(mutation?.status).toBe('error');
    expect(mutation?.error?.message).toBe('Nope');
    expect(context.emitted).toEqual([]);
  });
});
