/**
 * The shell's fetch for the admin JSON endpoints, behind the Pilet API as `fetchJson` and handed to every
 * server query and mutation. It follows the admin's XHR convention: Accept JSON and X-Requested-With on
 * every request, so an ended session answers 401 or 403 with X-Reauthenticate instead of redirecting to
 * the login form, and the CSRF token from the client config in X-SecurityID on anything but a GET.
 *
 * Failures throw a `ServerRequestError` carrying the status, what the server said (the CMS JSON error
 * envelope's messages, a plain JSON body's `message`, or the first line of the plain-text error a dev-mode site sends), and
 * `sessionExpired`, which a login redirect also sets, and the envelope's first error's `reason` and `field`
 * for an endpoint that names them. A section the member cannot view answers an XHR
 * with a 200 that redirects by header (AdminController::redirect), which counts as a 403.
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
    /** What the server said about the failure, when it said anything worth showing */
    readonly serverMessage: string | null = null,
    /** The first error's `reason` in the CMS JSON envelope, a code an endpoint can name the failure with */
    readonly reason?: string,
    /** The first error's `field` in the CMS JSON envelope */
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ServerRequestError';
  }
}

/**
 * The message in an error body: a JSON error's texts, or the first line of the plain-text error a
 * dev-mode site sends to XHR. HTML error pages carry nothing worth showing
 */
export function serverMessage(body: string, contentType: string | null): string | null {
  const data = parsed(body) as { errors?: Array<{ value?: unknown }>; message?: unknown } | null | undefined;
  if (data !== undefined || contentType?.includes('application/json')) {
    // SudoModeController and other plain JSON endpoints answer `{"message": "..."}`
    if (typeof data?.message === 'string' && data.message !== '') {
      return data.message;
    }
    const texts = (Array.isArray(data?.errors) ? data.errors : [])
      .map((error) => error?.value)
      .filter((value): value is string => typeof value === 'string' && value !== '');
    return texts.length > 0 ? texts.join(' ') : null;
  }
  const firstLine = body.trimStart().split('\n', 1)[0]?.trim() ?? '';
  return firstLine && !firstLine.startsWith('<') ? firstLine.slice(0, 300) : null;
}

/** The first error's `reason` and `field` in a CMS JSON error envelope */
function envelopeError(body: unknown): { reason?: string; field?: string } {
  const first = (body as { errors?: Array<{ reason?: unknown; field?: unknown }> } | null | undefined)?.errors?.[0];
  return {
    reason: typeof first?.reason === 'string' && first.reason !== '' ? first.reason : undefined,
    field: typeof first?.field === 'string' && first.field !== '' ? first.field : undefined,
  };
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

function parsed(text: string): unknown {
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
  const text = await response.text().catch(() => '');
  const said = response.ok ? null : serverMessage(text, response.headers.get('content-type'));
  const body = parsed(text);
  const { reason, field } = response.ok ? {} : envelopeError(body);
  if (response.status === 401 || (response.status === 403 && response.headers.has('X-Reauthenticate'))) {
    throw new ServerRequestError(said ?? sessionExpiredMessage, response.status, true, said, reason, field);
  }
  if (response.headers.has('X-ControllerURL')) {
    throw new ServerRequestError(`The server redirected ${target.pathname}`, 403);
  }
  if (!response.ok || body === undefined) {
    throw new ServerRequestError(
      said ?? `The server answered ${response.status} from ${target.pathname}`,
      response.status,
      false,
      said,
      reason,
      field,
    );
  }
  return body as T;
};
