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
 * `invalidateRecords` is the same emit under a name that says why.
 */
import { QueryClient, keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import type { GlobalStateContext, PiralPlugin } from 'piral-core';
import { recordsChangedEvent } from '../events';
import type { RecordsChangedEvent } from '../events';
import { sharedConfig } from './sharedState';
import { ServerRequestError, fetchJson } from './serverRequest';
import type { ServerRequest } from './serverRequest';

export type ServerQueryKeyPart = string | number | boolean | null;

/** `[scope, ...parts]`, the scope being `schema`, `grid`, `blocks` or a record class */
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
  /**
   * The ids of records of the key's class that the result shows, such as the rows of a listing; an event
   * naming one of them invalidates the key too
   */
  records?(data: T): ReadonlyArray<number>;
}

export interface ServerQueryResult<T> {
  status: 'pending' | 'error' | 'success';
  data: T | undefined;
  error: Error | null;
  /** True during any fetch, including a background refetch with data already shown */
  isFetching: boolean;
  refetch(): Promise<void>;
}

export type ServerMutation<V, R> = (variables: V, request: ServerRequest) => Promise<R>;

export interface ServerMutationOptions<V, R> {
  /** The records a successful mutation changed; each is announced as a records-changed event */
  changes?(variables: V, result: R): RecordsChangedEvent | ReadonlyArray<RecordsChangedEvent> | null;
}

export interface ServerMutationResult<V, R> {
  /** Resolves with the result or rejects with the error, which `error` also holds */
  mutate(variables: V): Promise<R>;
  status: 'idle' | 'pending' | 'error' | 'success';
  error: Error | null;
  reset(): void;
}

export interface ServerCacheApi {
  /**
   * Reads and caches `fetcher`'s result under `key`; the same key on screen twice fetches once. A
   * records-changed event matching the key refetches it (PILET-API.md, "Shared state and events")
   */
  useServerQuery<T>(key: ServerQueryKey, fetcher: ServerQueryFetcher<T>, options?: ServerQueryOptions<T>): ServerQueryResult<T>;
  /** Runs a write; on success announces the records `options.changes` names, which invalidates them */
  useServerMutation<V, R>(mutation: ServerMutation<V, R>, options?: ServerMutationOptions<V, R>): ServerMutationResult<V, R>;
  /** Emits records-changed for these records, which refetches every cached read they match */
  invalidateRecords(recordClass: string, ids: ReadonlyArray<number>): void;
  /** The shell's fetch: admin XHR headers, X-SecurityID on writes, session expiry as an error */
  fetchJson: ServerRequest;
}

declare module 'piral-core/lib/types/custom' {
  interface PiletCustomApi extends ServerCacheApi {}
}

const everyChangeScopes = new Set(['schema', 'grid', 'blocks']);

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
  records?(data: unknown): ReadonlyArray<number>;
}

function shownRecords(meta: ServerQueryMeta | undefined, data: unknown): ReadonlyArray<number> {
  return data === undefined || !meta?.records ? [] : meta.records(data);
}

function retryable(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !(error instanceof ServerRequestError && error.status < 500);
}

export function createServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryable, refetchOnWindowFocus: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function invalidateRecordsChanged(queryClient: QueryClient, event: RecordsChangedEvent): Promise<void> {
  const ancestry = configuredAncestry();
  return queryClient.invalidateQueries({
    predicate: (query) =>
      matchesRecordsChanged(query.queryKey, event, shownRecords(query.meta as ServerQueryMeta | undefined, query.state.data), ancestry),
  });
}

function announce(context: GlobalStateContext, changes: RecordsChangedEvent | ReadonlyArray<RecordsChangedEvent> | null): void {
  const events: ReadonlyArray<RecordsChangedEvent> = changes === null ? [] : Array.isArray(changes) ? changes : [changes as RecordsChangedEvent];
  events.forEach((event) => context.emit(recordsChangedEvent, event));
}

export function createServerCacheApi(queryClient: QueryClient = createServerQueryClient()): PiralPlugin<ServerCacheApi> {
  return (context) => {
    context.on(recordsChangedEvent, (event: RecordsChangedEvent) => {
      void invalidateRecordsChanged(queryClient, event);
    });

    function useServerQuery<T>(key: ServerQueryKey, fetcher: ServerQueryFetcher<T>, options: ServerQueryOptions<T> = {}): ServerQueryResult<T> {
      const query = useQuery(
        {
          queryKey: key,
          queryFn: ({ signal }) => fetcher({ signal, request: fetchJson }),
          enabled: options.enabled ?? true,
          staleTime: options.staleTime,
          placeholderData: options.keepPrevious ? keepPreviousData : undefined,
          meta: options.records ? ({ records: options.records } as ServerQueryMeta) : undefined,
        },
        queryClient,
      );
      return {
        status: query.status,
        data: query.data,
        error: query.error,
        isFetching: query.isFetching,
        refetch: async () => {
          await query.refetch();
        },
      };
    }

    function useServerMutation<V, R>(mutation: ServerMutation<V, R>, options: ServerMutationOptions<V, R> = {}): ServerMutationResult<V, R> {
      const result = useMutation<R, Error, V>(
        {
          mutationFn: (variables) => mutation(variables, fetchJson),
          onSuccess: (data, variables) => announce(context, options.changes?.(variables, data) ?? null),
        },
        queryClient,
      );
      return { mutate: result.mutateAsync, status: result.status, error: result.error, reset: result.reset };
    }

    return () => ({
      useServerQuery,
      useServerMutation,
      invalidateRecords(recordClass, ids) {
        announce(context, { recordClass, ids: [...ids] });
      },
      fetchJson,
    });
  };
}
