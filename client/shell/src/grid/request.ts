/**
 * Requests to the rows endpoint, with the headers of the admin JSON API convention: Accept JSON and
 * X-Requested-With on every request (so an expired session answers 401/403 rather than redirecting to
 * the login form), and the CSRF token from the client config in X-SecurityID on a POST.
 */
import type { GridPayload } from './types';

export class GridRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The first message of the CMS JSON error envelope, `{status: 'error', errors: [{code, value}]}`, or a
 * message for the status. The admin sends 403 with `X-Reauthenticate` when the session has ended and a
 * plain 403 when the member lacks the section's permission
 */
export function errorMessage(body: unknown, status: number, reauthenticate = false): string {
  const errors = (body as { errors?: Array<{ value?: unknown }> } | null)?.errors;
  const value = Array.isArray(errors) ? errors[0]?.value : undefined;
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (status === 401 || (status === 403 && reauthenticate)) {
    return 'Your session may have expired. Reload the page to log in again.';
  }
  if (status === 403) {
    return 'You do not have permission to see this list.';
  }
  return `The grid could not be loaded (${status}).`;
}

export async function requestGrid(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<GridPayload> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (init.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['X-SecurityID'] = String(window.ss.config.SecurityID ?? '');
  }
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || response.redirected || !body) {
    throw new GridRequestError(response.status, errorMessage(body, response.status, response.headers.has('X-Reauthenticate')));
  }
  return body as GridPayload;
}
