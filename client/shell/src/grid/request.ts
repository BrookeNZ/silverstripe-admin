/**
 * Requests to the rows endpoint through the shell's fetch, which sends the admin XHR headers and the
 * CSRF token on a POST; a failure becomes a `GridRequestError` with the message the grid shows.
 */
import { ServerRequestError, fetchJson } from '../state/serverRequest';
import type { GridPayload } from './types';

export class GridRequestError extends ServerRequestError {
  constructor(status: number, message: string) {
    super(message, status);
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
  let body: GridPayload | null;
  try {
    body = await fetchJson<GridPayload | null>(url, init);
  } catch (error) {
    if (error instanceof ServerRequestError) {
      throw new GridRequestError(error.status, error.serverMessage ?? errorMessage(null, error.status, error.sessionExpired));
    }
    throw error;
  }
  if (!body) {
    throw new GridRequestError(200, errorMessage(null, 200));
  }
  return body;
}
