/**
 * The shell's fetch for the admin JSON endpoints, behind the Pilet API as `fetchJson` and handed to every
 * server query and mutation. It follows the admin's XHR convention: Accept JSON and X-Requested-With on
 * every request, so an ended session answers 401 or 403 with X-Reauthenticate instead of redirecting to
 * the login form, and the CSRF token from the client config in X-SecurityID on anything but a GET.
 *
 * Failures throw a `ServerRequestError` carrying the status, the first message of the CMS JSON error
 * envelope where there is one, and `sessionExpired`, which a login redirect also sets.
 */
import { sharedConfig } from './sharedState';

export type ServerRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ServerRequestInit {
  method?: ServerRequestMethod;
  /** Added to the URL's query string */
  query?: Readonly<Record<string, string | number | boolean>>;
  /** Sent as JSON, except URLSearchParams and FormData, which are sent as they are */
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

/** Resolves to the parsed JSON body, or null for an empty one */
export type ServerRequest = <T = unknown>(url: string, init?: ServerRequestInit) => Promise<T>;

export const sessionExpiredMessage = 'Your session may have expired. Reload the page to log in again.';

export class ServerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly sessionExpired: boolean = false,
  ) {
    super(message);
    this.name = 'ServerRequestError';
  }
}

function envelopeMessage(body: unknown): string | null {
  const errors = (body as { errors?: Array<{ value?: unknown }> } | null)?.errors;
  const value = Array.isArray(errors) ? errors[0]?.value : undefined;
  return typeof value === 'string' && value !== '' ? value : null;
}

function requestBody(body: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (body instanceof URLSearchParams || body instanceof FormData) {
    return body;
  }
  headers['Content-Type'] = 'application/json';
  return JSON.stringify(body);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const fetchJson: ServerRequest = async <T,>(url: string, init: ServerRequestInit = {}): Promise<T> => {
  const method = init.method ?? 'GET';
  const target = new URL(url, document.baseURI);
  Object.entries(init.query ?? {}).forEach(([name, value]) => target.searchParams.set(name, String(value)));
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...init.headers };
  if (method !== 'GET') {
    headers['X-SecurityID'] = String(sharedConfig().SecurityID ?? '');
  }
  const response = await fetch(target.href, {
    method,
    credentials: 'same-origin',
    headers,
    body: requestBody(init.body, headers),
    signal: init.signal,
  });
  if (response.redirected) {
    throw new ServerRequestError(sessionExpiredMessage, 401, true);
  }
  const body = await readBody(response);
  if (response.status === 401 || (response.status === 403 && response.headers.has('X-Reauthenticate'))) {
    throw new ServerRequestError(envelopeMessage(body) ?? sessionExpiredMessage, response.status, true);
  }
  if (!response.ok || body === undefined) {
    throw new ServerRequestError(envelopeMessage(body) ?? `The server answered ${response.status} from ${target.pathname}`, response.status);
  }
  return body as T;
};
