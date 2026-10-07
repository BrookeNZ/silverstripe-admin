/**
 * Stands in for the admin's lib/Backend: the shell's server cache verbs, which the pilet's setup hands
 * over before any field renders. Reads on screen go through `useServerQuery`, writes through
 * `useServerMutation`, and the imperative loaders (search-as-you-type, the tree dropdown's lazy levels)
 * through `fetchJson`, which sends the admin XHR headers and the CSRF token on anything but a GET.
 */
import type { PiletApi } from '@silverstripe/admin-shell';

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

/** The status of a failed request, which the shell's fetch puts on its error */
export function failedStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}
