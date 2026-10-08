/**
 * Requests to the rows endpoint through the shell's fetch, which sends the admin XHR headers and the
 * CSRF token on a POST; a failure is rethrown as a `ServerRequestError` with the message the grid shows.
 */
import { ServerRequestError, fetchJson, sessionExpiredMessage } from '../state/serverRequest';
import type { GridPayload } from './types';

/**
 * The message for a status when the server said nothing worth showing. The admin sends 403 with
 * `X-Reauthenticate` when the session has ended and a plain 403 when the member lacks the section's permission
 */
export function errorMessage(status: number, reauthenticate = false): string {
  if (status === 401 || (status === 403 && reauthenticate)) {
    return sessionExpiredMessage;
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
      throw new ServerRequestError(
        error.serverMessage ?? errorMessage(error.status, error.sessionExpired),
        error.status,
        error.sessionExpired,
        error.serverMessage,
        error.reason,
        error.field,
      );
    }
    throw error;
  }
  if (!body) {
    throw new ServerRequestError(errorMessage(200), 200);
  }
  return body;
}
