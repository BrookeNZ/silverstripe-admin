/**
 * The server cache: one TanStack Query client owned by the shell, reached by pilets only through the
 * Pilet API verbs below, so no pilet imports the library or holds a client. Hooks pass the client to
 * TanStack's hooks directly, so nothing has to sit in a provider above the pilets' components.
 *
 * Keys start with a scope. `schema`, `grid` and `blocks` keys are invalidated by every records-changed
 * event, because a form schema, a grid's rows or an area's blocks can show any record. Any other scope is
 * a record class: such a key is invalidated when the event names a related class and either one of its
 * ids is the key's second part, the second part is not a number (a list over the class), or the read's
 * `records` option lists it among the records the cached result shows (the pages tree's child listings).
 *
 * Classes are related when one is the other or an ancestor of it, per the config's `recordClasses` map
 * (built by RecordClassAncestry.php): an event for `Page` reaches keys under `SiteTree`, and an event for
 * `SiteTree` reaches keys under `Page`, as legacy's full tree reload did. A class missing from the map
 * matches only its own name.
 *
 * Invalidation refetches what is on screen and marks the rest stale. Emitters keep emitting the event;
 * `invalidateRecords` is the same emit under a name that says why. An event is checked before it is
 * acted on, since any pilet can emit one: a malformed event is dropped with a warning rather than
 * stopping every other key's invalidation, and numeric-string ids are read as numbers.
 *
 * A pilet's keys are stored under its own name (`['pilet:<name>', ...key]`), so two pilets, or a pilet
 * and the shell, never share an entry by accident; matching runs on the key the pilet wrote. A key whose
 * scope starts `shared:` is stored as written, for data pilets deliberately share, and matches as the
 * scope after the prefix. The shell's every-change scopes are reserved: a pilet key starting with one
 * throws in development and warns in production.
 *
 * Shell components (the form, the grid) read through `useShellServerQuery` and `useShellServerMutation`,
 * which use the same client the plugin hands pilets.
 */
import { QueryClient, keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useGlobalStateContext } from 'piral-core';
import type { GlobalStateContext, PiralPlugin } from 'piral-core';
import { recordsChangedEvent } from '../events';
import type { RecordsChangedEvent } from '../events';
import { sharedConfig } from './sharedState';
import { ServerRequestError, fetchJson, isNetworkFailure } from './serverRequest';
import type { ServerRequest } from './serverRequest';
import type { ServerRequestErrorShape } from './errorTypes';

export type ServerQueryKeyPart = string | number | boolean | null;

/**
 * `[scope, ...parts]`: for the shell the scope is `schema`, `grid`, `blocks` or a record class; for a
 * pilet a record class, a name of its own, or `shared:<scope>` for an entry pilets share
 */
export type ServerQueryKey = readonly [string, ...Array<ServerQueryKeyPart>];

export interface ServerQueryContext {
  signal: AbortSignal;
  request: ServerRequest;
}

export type ServerQueryFetcher<T> = (context: ServerQueryContext) => Promise<T>;

export interface ServerQueryOptions<T = unknown> {
  /** False holds the query back, for a key that is not known yet */
  enabled?: boolean;
  /** How long a result counts as fresh, in milliseconds; 0 by default, so a remount refetches */
  staleTime?: number;
  /** Keeps showing the previous key's data while the next key loads, as paging wants */
  keepPrevious?: boolean;
  /** Shown as the first result, with no loading state; as the cache treats it, a stale one is refetched behind it */
  initialData?: T;
  /** When `initialData` was fetched, in epoch milliseconds, so `staleTime` counts from then; now by default */
  initialDataUpdatedAt?: number;
  /**
   * The ids of records of the key's class that the result shows, such as the rows of a listing; an event
   * naming one of them invalidates the key too
   */
  records?: (data: T) => ReadonlyArray<number>;
}

export interface ServerQueryResult<T> {
  status: 'pending' | 'error' | 'success';
  data: T | undefined;
  /** A `ServerRequestError` from `fetchJson`, or whatever else the fetcher threw */
  error: ServerRequestErrorShape | Error | null;
  /** True during any fetch, including a background refetch with data already shown */
  isFetching: boolean;
  /** Resolves to the data once the fetch settles; a failed fetch leaves the previous data, if any */
  refetch: () => Promise<T | undefined>;
}

export type ServerMutation<V, R> = (variables: V, request: ServerRequest) => Promise<R>;

export interface ServerMutationOptions<V, R> {
  /** The records a successful mutation changed; each is announced as a records-changed event */
  changes?: (variables: V, result: R) => RecordsChangedEvent | ReadonlyArray<RecordsChangedEvent> | null;
}

export interface ServerMutationResult<V, R> {
  /** Resolves with the result or rejects with the error, which `error` also holds */
  mutate: (variables: V) => Promise<R>;
  status: 'idle' | 'pending' | 'error' | 'success';
  /** A `ServerRequestError` from `fetchJson`, or whatever else the mutation threw */
  error: ServerRequestErrorShape | Error | null;
  reset: () => void;
}

export interface ServerCacheApi {
  /**
   * Reads and caches `fetcher`'s result under `key`, stored under the pilet's name unless its scope starts
   * `shared:`; the same key on screen twice fetches once. A records-changed event matching the key
   * refetches it (PILET-API.md, "Server cache")
   */
  useServerQuery: <T>(key: ServerQueryKey, fetcher: ServerQueryFetcher<T>, options?: ServerQueryOptions<T>) => ServerQueryResult<T>;
  /** Runs a write; on success announces the records `options.changes` names, which invalidates them */
  useServerMutation: <V, R>(mutation: ServerMutation<V, R>, options?: ServerMutationOptions<V, R>) => ServerMutationResult<V, R>;
  /** Emits records-changed for these records, which refetches every cached read they match */
  invalidateRecords: (recordClass: string, ids: ReadonlyArray<number>) => void;
  /** The shell's fetch: admin XHR headers, X-SecurityID on same-origin writes, session expiry as an error */
  fetchJson: ServerRequest;
}

declare module 'piral-core/lib/types/custom' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merging into Piral's pilet API needs an interface
  interface PiletCustomApi extends ServerCacheApi {}
}

const everyChangeScopes = new Set(['schema', 'grid', 'blocks']);

export const sharedScopePrefix = 'shared:';

const piletKeyPrefix = 'pilet:';

/** The key a pilet's read is stored under */
export function piletStorageKey(pilet: string, key: ServerQueryKey): ServerQueryKey {
  const [scope] = key;
  if (scope.startsWith(sharedScopePrefix)) {
    return key;
  }
  if (everyChangeScopes.has(scope)) {
    const message = `Pilet "${pilet}" read the key ["${scope}", ...]; "${scope}" is a scope the shell reserves, so pick a scope of its own or "${sharedScopePrefix}${scope}"`;
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(message);
    }
    console.warn(message);
  }
  return [`${piletKeyPrefix}${pilet}`, ...key];
}

/** The key as its owner wrote it, without the pilet prefix or the shared prefix, which is what events match */
export function matchingKey(key: QueryKey): QueryKey {
  const [scope, ...parts] = key;
  if (typeof scope !== 'string') {
    return key;
  }
  if (scope.startsWith(piletKeyPrefix)) {
    return parts;
  }
  if (scope.startsWith(sharedScopePrefix)) {
    return [scope.slice(sharedScopePrefix.length), ...parts];
  }
  return key;
}

/**
 * The event with numeric-string ids read as numbers, or null when it is not a records-changed event a
 * key could be matched against
 */
export function validRecordsChanged(event: unknown): RecordsChangedEvent | null {
  const { recordClass, ids } = (event ?? {}) as { recordClass?: unknown; ids?: unknown };
  if (typeof recordClass !== 'string' || recordClass === '' || !Array.isArray(ids)) {
    return null;
  }
  const numbers: Array<number> = [];
  for (const id of ids) {
    const number = typeof id === 'string' && /^[0-9]+$/.test(id) ? Number(id) : id;
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      return null;
    }
    numbers.push(number);
  }
  return { recordClass, ids: numbers };
}

/** Each record class mapped to its ancestors, as the client config carries it */
export type RecordClassAncestry = Readonly<Record<string, ReadonlyArray<string>>>;

function configuredAncestry(): RecordClassAncestry {
  return sharedConfig().recordClasses ?? {};
}

export function recordClassesRelated(first: string, second: string, ancestry: RecordClassAncestry): boolean {
  return first === second || (ancestry[first]?.includes(second) ?? false) || (ancestry[second]?.includes(first) ?? false);
}

/** `shown` is what the read's `records` option returned for its cached result */
export function matchesRecordsChanged(
  key: QueryKey,
  event: RecordsChangedEvent,
  shown: ReadonlyArray<number> = [],
  ancestry: RecordClassAncestry = configuredAncestry(),
): boolean {
  const [scope, id] = key;
  if (typeof scope !== 'string') {
    return false;
  }
  if (everyChangeScopes.has(scope)) {
    return true;
  }
  if (!recordClassesRelated(scope, event.recordClass, ancestry)) {
    return false;
  }
  return typeof id !== 'number' || event.ids.length === 0 || event.ids.includes(id) || shown.some((held) => event.ids.includes(held));
}

interface ServerQueryMeta extends Record<string, unknown> {
  records?: (data: unknown) => ReadonlyArray<number>;
}

// One retry for a request that got no answer or a 5xx; anything else (a 4xx, a fetcher's own bug) will not change
function retryable(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && (isNetworkFailure(error) || (error instanceof ServerRequestError && error.status >= 500));
}

export function createServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Refetching on focus would reload a form under an editor's unsaved changes; legacy never refetches on focus
      queries: { retry: retryable, refetchOnWindowFocus: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Malformed events are dropped with a warning; see `validRecordsChanged` */
export function invalidateRecordsChanged(queryClient: QueryClient, event: RecordsChangedEvent): Promise<void> {
  const valid = validRecordsChanged(event);
  if (!valid) {
    console.warn('A records-changed event was dropped: it needs a recordClass string and an ids array of numbers', event);
    return Promise.resolve();
  }
  const ancestry = configuredAncestry();
  // A records callback that throws cannot say what its result shows, so its key matches as a list over the class
  const everyId: RecordsChangedEvent = { recordClass: valid.recordClass, ids: [] };
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = matchingKey(query.queryKey);
      const records = (query.meta as ServerQueryMeta | undefined)?.records;
      const data = query.state.data;
      if (!records || data === undefined) {
        return matchesRecordsChanged(key, valid, [], ancestry);
      }
      try {
        return matchesRecordsChanged(key, valid, records(data), ancestry);
      } catch (error) {
        console.error(`The records option of the read ${JSON.stringify(query.queryKey)} failed; it is invalidated`, error);
        return matchesRecordsChanged(key, everyId, [], ancestry);
      }
    },
  });
}

function announce(context: GlobalStateContext, changes: RecordsChangedEvent | ReadonlyArray<RecordsChangedEvent> | null): void {
  const events: ReadonlyArray<RecordsChangedEvent> = changes === null ? [] : Array.isArray(changes) ? changes : [changes as RecordsChangedEvent];
  events.forEach((event) => context.emit(recordsChangedEvent, event));
}

function useCachedQuery<T>(
  queryClient: QueryClient,
  key: ServerQueryKey,
  fetcher: ServerQueryFetcher<T>,
  options: ServerQueryOptions<T> = {},
): ServerQueryResult<T> {
  const query = useQuery(
    {
      queryKey: key,
      queryFn: ({ signal }) => fetcher({ signal, request: fetchJson }),
      enabled: options.enabled ?? true,
      staleTime: options.staleTime,
      placeholderData: options.keepPrevious ? keepPreviousData : undefined,
      initialData: options.initialData,
      initialDataUpdatedAt: options.initialDataUpdatedAt,
      meta: options.records ? ({ records: options.records } as ServerQueryMeta) : undefined,
    },
    queryClient,
  );
  return {
    status: query.status,
    data: query.data,
    error: query.error,
    isFetching: query.isFetching,
    refetch: async () => (await query.refetch()).data,
  };
}

function useCachedMutation<V, R>(
  queryClient: QueryClient,
  context: GlobalStateContext,
  mutation: ServerMutation<V, R>,
  options: ServerMutationOptions<V, R> = {},
): ServerMutationResult<V, R> {
  const result = useMutation<R, Error, V>(
    {
      mutationFn: (variables) => mutation(variables, fetchJson),
      onSuccess: (data, variables) => {
        // The write has happened, so a fault in naming what it changed must not report it as failed
        try {
          announce(context, options.changes?.(variables, data) ?? null);
        } catch (error) {
          console.error('The changes option of a server mutation failed; nothing was announced', error);
        }
      },
    },
    queryClient,
  );
  return { mutate: result.mutateAsync, status: result.status, error: result.error, reset: result.reset };
}

/** The client the shell registers, so shell components and pilets share one cache */
export const serverQueryClient = createServerQueryClient();

export function useShellServerQuery<T>(key: ServerQueryKey, fetcher: ServerQueryFetcher<T>, options?: ServerQueryOptions<T>): ServerQueryResult<T> {
  return useCachedQuery(serverQueryClient, key, fetcher, options);
}

export function useShellServerMutation<V, R>(mutation: ServerMutation<V, R>, options?: ServerMutationOptions<V, R>): ServerMutationResult<V, R> {
  return useCachedMutation(serverQueryClient, useGlobalStateContext(), mutation, options);
}

/** Emits records-changed from a shell component, for a write made outside `useShellServerMutation` */
export function announceRecords(context: GlobalStateContext, changes: RecordsChangedEvent | ReadonlyArray<RecordsChangedEvent>): void {
  announce(context, changes);
}

/**
 * Refetches the read under exactly `key` if it is on screen; a fetch already running (one an event just
 * started) is joined rather than restarted
 */
export function refetchShellServerQuery(key: ServerQueryKey): Promise<void> {
  return serverQueryClient.refetchQueries({ queryKey: key, exact: true, type: 'active' }, { cancelRefetch: false });
}

/** Refetches every read on screen and marks the rest stale, for a change that alters what the member may see */
export function invalidateShellServerCache(): Promise<void> {
  return serverQueryClient.invalidateQueries();
}

export function createServerCacheApi(queryClient: QueryClient = serverQueryClient): PiralPlugin<ServerCacheApi> {
  return (context) => {
    context.on(recordsChangedEvent, (event: RecordsChangedEvent) => {
      void invalidateRecordsChanged(queryClient, event);
    });

    function useServerMutation<V, R>(mutation: ServerMutation<V, R>, options?: ServerMutationOptions<V, R>): ServerMutationResult<V, R> {
      return useCachedMutation(queryClient, context, mutation, options);
    }

    return (_api, meta) => ({
      useServerQuery<T>(key: ServerQueryKey, fetcher: ServerQueryFetcher<T>, options?: ServerQueryOptions<T>): ServerQueryResult<T> {
        return useCachedQuery(queryClient, piletStorageKey(meta.name, key), fetcher, options);
      },
      useServerMutation,
      invalidateRecords(recordClass, ids) {
        announce(context, { recordClass, ids: [...ids] });
      },
      fetchJson,
    });
  };
}
