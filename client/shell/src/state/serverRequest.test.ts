// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSharedConfig } from './sharedState';
import { ServerRequestError, fetchJson, sessionExpiredMessage } from './serverRequest';

const fetchMock = vi.fn<typeof fetch>();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const sent = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

beforeEach(() => {
  resetSharedConfig();
  window.ss = { config: { SecurityID: 'csrf-token', sections: [] } } as unknown as typeof window.ss;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('reads JSON with the admin XHR headers and no CSRF token', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(fetchJson('https://example.test/admin/api/read', { query: { id: 7, page: 2 } })).resolves.toEqual({ ok: true });

    const { url, init, headers } = sent();
    expect(url).toBe('https://example.test/admin/api/read?id=7&page=2');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(headers['X-SecurityID']).toBeUndefined();
  });

  it('sends the CSRF token and a JSON body on a write', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(fetchJson('https://example.test/admin/api/revert', { method: 'POST', body: { id: 7 } })).resolves.toBeNull();

    const { init, headers } = sent();
    expect(headers['X-SecurityID']).toBe('csrf-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"id":7}');
  });

  it('sends form data as it is', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const body = new URLSearchParams({ Title: 'Home' });
    await fetchJson('https://example.test/admin/save', { method: 'POST', body });

    expect(sent().init.body).toBe(body);
    expect(sent().headers['Content-Type']).toBeUndefined();
  });

  it('raises the CMS envelope message with the status', async () => {
    fetchMock.mockResolvedValue(json(404, { status: 'error', errors: [{ code: 404, value: 'Record not found' }] }));
    const error = await fetchJson('https://example.test/admin/api/read').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerRequestError);
    expect(error).toMatchObject({ message: 'Record not found', status: 404, sessionExpired: false });
  });

  it('carries the envelope\'s first reason and field', async () => {
    fetchMock.mockResolvedValue(
      json(403, { errors: [{ value: 'Pages cannot be added under this page', reason: 'notAllowedHere', field: 'parentId' }, { reason: 'other' }] }),
    );
    const error = await fetchJson('https://example.test/admin/pages/move/page', { method: 'POST' }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 403, reason: 'notAllowedHere', field: 'parentId', sessionExpired: false });
  });

  it('raises a plain JSON body\'s message, such as a refused sudo mode password', async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'Incorrect password' }));
    const error = await fetchJson('https://example.test/admin/sudomode/activate', { method: 'POST' }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ message: 'Incorrect password', serverMessage: 'Incorrect password', status: 401 });
  });

  it('reports an ended session for a 401, a 403 asking to reauthenticate and a login redirect', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403, headers: { 'X-Reauthenticate': '1' } }));
    const redirected = json(200, {});
    Object.defineProperty(redirected, 'redirected', { value: true });
    fetchMock.mockResolvedValueOnce(redirected);

    for (const expected of [401, 403, 401]) {
      await expect(fetchJson('https://example.test/admin/api/read')).rejects.toMatchObject({
        message: sessionExpiredMessage,
        status: expected,
        sessionExpired: true,
      });
    }
  });

  it('rejects a success whose body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', { status: 200 }));
    await expect(fetchJson('https://example.test/admin/api/read')).rejects.toMatchObject({ status: 200, sessionExpired: false });
  });

  it('reads a plain 403 as no permission, not an ended session', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await expect(fetchJson('https://example.test/admin/api/read')).rejects.toMatchObject({ status: 403, sessionExpired: false });
  });

  it('reads a redirect by header to a section the member cannot view as a 403', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200, headers: { 'X-ControllerURL': 'admin/pages' } }));
    await expect(fetchJson('https://example.test/admin/api/read')).rejects.toMatchObject({ status: 403, sessionExpired: false });
  });

  it('keeps the first line of a dev-mode plain-text error as what the server said', async () => {
    fetchMock.mockResolvedValue(new Response('ERROR [Emergency]: Uncaught LogicException\nIN GET /admin', { status: 500, headers: { 'Content-Type': 'text/html' } }));
    await expect(fetchJson('https://example.test/admin/api/read')).rejects.toMatchObject({
      status: 500,
      serverMessage: 'ERROR [Emergency]: Uncaught LogicException',
    });
  });
});
