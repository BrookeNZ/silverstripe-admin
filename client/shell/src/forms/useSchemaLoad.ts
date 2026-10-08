/**
 * The form schema as a server cache read keyed `['schema', schemaUrl]`: the load state a form renders
 * from, the refetch a save waits for, and the hand-off of each refetched response to the form on screen.
 */
import * as React from 'react';
import { refetchShellServerQuery, useShellServerQuery } from '../state/serverCache';
import type { ServerQueryResult } from '../state/serverCache';
import { fetchFormSchema } from './schema';
import type { FormSchemaResponse, FormSchemaState, FormSchemaTree } from './types';

const schemaKey = (schemaUrl: string) => ['schema', schemaUrl] as const;

export const refetchSchema = (schemaUrl: string) => refetchShellServerQuery(schemaKey(schemaUrl));

export type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown; message: string }
  | { status: 'ready'; response: FormSchemaResponse; schema: FormSchemaTree; state: FormSchemaState };

/** Cached data wins over a failed refetch, so a form on screen stays there */
function loadState(query: ServerQueryResult<FormSchemaResponse>): LoadState {
  const response = query.data;
  if (response?.schema && response.state) {
    return { status: 'ready', response, schema: response.schema, state: response.state };
  }
  if (response) {
    return { status: 'failed', error: new Error('The form endpoint sent no schema or state'), message: 'The form endpoint sent no schema or state' };
  }
  if (query.error) {
    return { status: 'failed', error: query.error, message: query.error.message };
  }
  return { status: 'loading' };
}

/** Reads the schema and calls `onLoad` with each loaded response, the first and every refetch */
export function useSchemaLoad(schemaUrl: string, onLoad?: (response: FormSchemaResponse) => void): LoadState {
  const query = useShellServerQuery(schemaKey(schemaUrl), ({ signal }) => fetchFormSchema(schemaUrl, signal));
  const load = loadState(query);
  const loadListener = React.useRef(onLoad);
  loadListener.current = onLoad;
  const loaded = load.status === 'ready' ? load.response : null;

  React.useEffect(() => {
    if (loaded) {
      loadListener.current?.(loaded);
    }
  }, [loaded]);

  return load;
}

/** Calls `apply` once for each response after the first that carries a schema */
export function useRefetchedResponse(
  latest: FormSchemaResponse,
  apply: (response: FormSchemaResponse & { schema: FormSchemaTree }) => void,
): void {
  const applied = React.useRef(latest);
  const latestApply = React.useRef(apply);
  latestApply.current = apply;
  React.useEffect(() => {
    if (latest === applied.current || !latest.schema) {
      return;
    }
    applied.current = latest;
    latestApply.current(latest as FormSchemaResponse & { schema: FormSchemaTree });
  }, [latest]);
}
