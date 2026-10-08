// @vitest-environment happy-dom
/**
 * Probes of the server cache and the shell fetch at their edges, each asserting the settled rule so a
 * change shows up as a failure: keys kept apart per owner, malformed records-changed events, a throwing
 * `records` callback, a throwing `changes` callback, garbage collection, the CSRF header off-origin,
 * redirects, an abort during the body read and the live token
 */
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { createServerCacheApi, createServerQueryClient, invalidateRecordsChanged, matchesRecordsChanged, piletStorageKey } from './serverCache';
import type { ServerCacheApi, ServerMutationResult, ServerQueryFetcher, ServerQueryKey, ServerQueryOptions, ServerQueryResult } from './serverCache';
import type { RecordsChangedEvent } from '../events';
import { resetSharedConfig } from './sharedState';
import { fetchJson } from './serverRequest';
import { recordsChangedEvent } from '../events';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import type { FakeGlobalContext } from '../test/fakeGlobalContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let context: FakeGlobalContext;
let queryClient: QueryClient;
let api: ServerCacheApi;
let otherApi: ServerCacheApi;
let root: Root;

const last = <T,>(list: ReadonlyArray<T>): T | undefined => list[list.length - 1];

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function Reader<T>({
  queryKey,
  fetcher,
  seen,
  options,
  owner = api,
}: {
  queryKey: ServerQueryKey;
  fetcher: ServerQueryFetcher<T>;
  seen: Array<ServerQueryResult<T>>;
  options?: ServerQueryOptions<T>;
  owner?: ServerCacheApi;
}) {
  seen.push(owner.useServerQuery(queryKey, fetcher, options));
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
  const forPilet = createServerCacheApi(queryClient)(context) as (piral: unknown, meta: { name: string }) => ServerCacheApi;
  api = forPilet({}, { name: 'pages' });
  otherApi = forPilet({}, { name: 'history' });
  root = createRoot(document.createElement('div'));
  resetSharedConfig();
  window.ss = { config: { SecurityID: 'csrf-token', sections: [] } } as unknown as typeof window.ss;
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('key scope', () => {
  it('keeps two owners of the same key apart, so each fetcher runs and reads its own data, unless the key is shared', async () => {
    const firstFetcher = vi.fn(async () => ({ shape: 'pages' }));
    const secondFetcher = vi.fn(async () => ['history', 'shape']);
    const sharedFirst = vi.fn(async () => 'shared');
    const sharedSecond = vi.fn(async () => 'never');
    const secondSeen: Array<ServerQueryResult<unknown>> = [];
    const sharedSeen: Array<ServerQueryResult<unknown>> = [];
    await render(
      <>
        <Reader queryKey={['Page', 7]} fetcher={firstFetcher} seen={[]} />
        <Reader queryKey={['Page', 7]} fetcher={secondFetcher} seen={secondSeen} owner={otherApi} />
        <Reader queryKey={['shared:Page', 7]} fetcher={sharedFirst} seen={[]} />
        <Reader queryKey={['shared:Page', 7]} fetcher={sharedSecond} seen={sharedSeen} owner={otherApi} />
      </>,
    );
    expect(firstFetcher).toHaveBeenCalledTimes(1);
    expect(secondFetcher).toHaveBeenCalledTimes(1);
    expect(last(secondSeen)?.data).toEqual(['history', 'shape']);
    expect(sharedSecond).not.toHaveBeenCalled();
    expect(last(sharedSeen)?.data).toBe('shared');
    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      ['pilet:pages', 'Page', 7],
      ['pilet:history', 'Page', 7],
      ['shared:Page', 7],
    ]);

    await act(async () => {
      api.invalidateRecords('Page', [7]);
    });
    await flush();
    expect(firstFetcher).toHaveBeenCalledTimes(2);
    expect(secondFetcher).toHaveBeenCalledTimes(2);
    // One shared entry refetches once, through whichever reader's fetcher it holds
    expect(sharedFirst.mock.calls.length + sharedSecond.mock.calls.length).toBe(2);
  });

  it('refuses a pilet key under an every-change scope: throws in development, warns and prefixes in production', () => {
    expect(() => piletStorageKey('pages', ['schema', 'my-pilet-thing'])).toThrow('reserves');
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(piletStorageKey('pages', ['schema', 'my-pilet-thing'])).toEqual(['pilet:pages', 'schema', 'my-pilet-thing']);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(piletStorageKey('pages', ['shared:schema', 'x'])).toEqual(['shared:schema', 'x']);
  });
});

describe('malformed records-changed events', () => {
  it('drops an event with no ids at the listener with a warning, rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const event of [{ recordClass: 'Page' }, { recordClass: 'Page', ids: 7 }, { recordClass: 3, ids: [7] }, { recordClass: 'Page', ids: ['seven'] }]) {
      expect(() => context.emit(recordsChangedEvent, event as unknown as RecordsChangedEvent)).not.toThrow();
    }
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('drops one malformed event without touching any key, and the next event still invalidates', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const schema = vi.fn(async () => 'schema');
    const page = vi.fn(async () => 'page');
    await render(
      <>
        <Reader queryKey={['shared:schema', 'admin/pages/schema']} fetcher={schema} seen={[]} />
        <Reader queryKey={['Page', 7]} fetcher={page} seen={[]} />
      </>,
    );
    await expect(invalidateRecordsChanged(queryClient, { recordClass: 'Page' } as unknown as RecordsChangedEvent)).resolves.toBeUndefined();
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(schema).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);

    await act(async () => {
      await invalidateRecordsChanged(queryClient, { recordClass: 'Page', ids: [7] });
    });
    await flush();
    expect(schema).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('matches a numeric key when the event names the id as a numeric string', async () => {
    const page = vi.fn(async () => 'page');
    await render(<Reader queryKey={['Page', 7]} fetcher={page} seen={[]} />);
    await act(async () => {
      context.emit(recordsChangedEvent, { recordClass: 'Page', ids: ['7'] } as unknown as RecordsChangedEvent);
    });
    await flush();
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('reads a numeric-string second part as a list over the class, so every event of the class matches it', () => {
    expect(matchesRecordsChanged(['Page', '7'], { recordClass: 'Page', ids: [99] }, [], {})).toBe(true);
  });
});

describe('one owner\'s records callback', () => {
  it('leaves every other key\'s invalidation running when it throws, and invalidates its own key', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = vi.fn(async () => ({ rows: 'not an array' }));
    const other = vi.fn(async () => 'other');
    await render(
      <>
        <Reader
          queryKey={['SiteTree', 0, 'children']}
          fetcher={broken}
          seen={[]}
          options={{ records: (data: { rows: unknown }) => (data.rows as Array<{ id: number }>).map((row) => row.id) }}
        />
        <Reader queryKey={['shared:schema', 'admin/pages/schema']} fetcher={other} seen={[]} />
      </>,
    );
    await act(async () => {
      await invalidateRecordsChanged(queryClient, { recordClass: 'SiteTree', ids: [3] });
    });
    await flush();
    expect(error).toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(2);
    expect(broken).toHaveBeenCalledTimes(2);
  });
});

describe('a throwing changes callback', () => {
  it('resolves mutate with the write\'s result and logs the error, since the write succeeded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    let mutation: ServerMutationResult<number, null> | undefined;
    const Writer = () => {
      mutation = api.useServerMutation((id: number, request) => request<null>('https://example.test/admin/save', { method: 'POST', body: { id } }), {
        changes: () => {
          throw new Error('bad changes');
        },
      });
      return null;
    };
    await render(<Writer />);
    await act(async () => {
      await expect(mutation?.mutate(7)).resolves.toBeNull();
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutation?.status).toBe('success');
    expect(error.mock.calls.some((call) => String(call[1]).includes('bad changes'))).toBe(true);
    expect(context.emitted).toEqual([]);
  });
});

describe('garbage collection', () => {
  it('drops an unmounted key after the default five minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render(<Reader queryKey={['Page', 1]} fetcher={async () => 'one'} seen={[]} />);
    await act(async () => {
      root.render(<></>);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('fetchJson', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sentHeaders = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('leaves the CSRF token off a write to another origin', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await fetchJson('https://elsewhere.example/collect', { method: 'POST', body: {} });
    expect(fetchMock.mock.calls[0][0]).toBe('https://elsewhere.example/collect');
    expect(sentHeaders()['X-SecurityID']).toBeUndefined();
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('same-origin');
  });

  it('reads only a redirect to the login form as an ended session; another is an error with the final status', async () => {
    const redirected = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(redirected, 'redirected', { value: true });
    Object.defineProperty(redirected, 'url', { value: `${location.origin}/admin/pages/` });
    fetchMock.mockResolvedValueOnce(redirected);
    await expect(fetchJson('/admin/pages')).rejects.toMatchObject({ status: 200, sessionExpired: false, name: 'ServerRequestError' });
  });

  it('passes an abort during the body read on as an AbortError', async () => {
    const response = new Response('{"a":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(response, 'text', { value: () => Promise.reject(new DOMException('aborted', 'AbortError')) });
    fetchMock.mockResolvedValueOnce(response);
    await expect(fetchJson('https://example.test/admin/read')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sends the token the config holds at request time', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await fetchJson('/admin/a', { method: 'POST' });
    window.ss.config.SecurityID = 'rotated-token';
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await fetchJson('/admin/b', { method: 'POST' });
    expect(sentHeaders()['X-SecurityID']).toBe('csrf-token');
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>)['X-SecurityID']).toBe('rotated-token');
  });

  it('lets a caller header with different casing sit beside the JSON content type', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await fetchJson('https://example.test/admin/a', { method: 'POST', body: { a: 1 }, headers: { 'content-type': 'text/plain' } });
    expect(sentHeaders()).toMatchObject({ 'content-type': 'text/plain', 'Content-Type': 'application/json' });
  });
});

describe('retry', () => {
  it('does not retry a fetcher\'s own TypeError, only a request that got no answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => {
      throw new TypeError('cannot read rows of undefined');
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const seen: Array<ServerQueryResult<unknown>> = [];
    await render(<Reader queryKey={['Page', 2]} fetcher={fetcher} seen={seen} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(last(seen)?.status).toBe('error');

    const unanswered = vi.fn(async () => fetchJson('/admin/read'));
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await render(<Reader queryKey={['Page', 3]} fetcher={unanswered} seen={[]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(unanswered).toHaveBeenCalledTimes(2);
  });
});
