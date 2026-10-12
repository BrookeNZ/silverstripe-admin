/**
 * Stands in for the admin's lib/Backend: the shell's server cache verbs, which the pilet's setup hands
 * over before any field renders. Reads on screen go through `useServerQuery`, writes through
 * `useServerMutation`, and the imperative loaders (search-as-you-type, the tree dropdown's lazy levels)
 * through `fetchJson`, which sends the admin XHR headers and the CSRF token on anything but a GET.
 */
import type { PiletApi, ServerRequestError } from '@silverstripe/admin-shell';

export const CSRF_HEADER = 'X-SecurityID';

export type ServerCache = Pick<PiletApi, 'useServerQuery' | 'useServerMutation' | 'invalidateRecords' | 'fetchJson'>;

let connected: ServerCache | undefined;

export function connectServerCache(api: ServerCache): void {
  connected = api;
}

export function serverCache(): ServerCache {
  if (!connected) {
    throw new Error('The fields pilet reached the server before its setup ran');
  }
  return connected;
}

/** The shell's request failure; pilets get its type but not its class, so it is recognised by name */
export function isServerRequestError(error: unknown): error is ServerRequestError {
  return error instanceof Error && error.name === 'ServerRequestError';
}

/** The status of a failed request, which the shell's fetch puts on its error */
export function failedStatus(error: unknown): number | null {
  return isServerRequestError(error) ? error.status : null;
}
