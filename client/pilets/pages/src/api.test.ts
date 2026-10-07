import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createTreeApi, requestJson } from './api';
import type { TreeRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown, redirected = false) {
  const fetch = vi.fn(async () => ({ ok: status < 300, status, redirected, json: async () => body }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('createTreeApi', () => {
  it('reads the endpoints through the request it is given', async () => {
    const request = vi.fn(async () => ({}));
    const api = createTreeApi('https://example.test/admin/pages/tree/', request as TreeRequest);
    const signal = new AbortController().signal;
    await api.children(0, 2, 250, signal);
    await api.ancestors(12, 250);
    await api.search('a b');
    expect(request.mock.calls).toEqual([
      ['https://example.test/admin/pages/tree/children/0', { query: { page: 2, limit: 250 }, signal }],
      ['https://example.test/admin/pages/tree/ancestors/12', { query: { limit: 250 }, signal: undefined }],
      ['https://example.test/admin/pages/tree/search', { query: { q: 'a b' }, signal: undefined }],
    ]);
  });

  it('turns the shell request error into an ApiError that keeps the session expiry', async () => {
    const expired = Object.assign(new Error('Your session may have expired'), { status: 403, sessionExpired: true });
    const api = createTreeApi('https://example.test/admin/pages/tree/', (async () => {
      throw expired;
    }) as TreeRequest);
    const error = (await api.children(0, 1, 50).catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.sessionExpired, error.message]).toEqual([403, true, 'Your session may have expired']);
  });
});

describe('requestJson', () => {
  it('sends the XHR headers and returns the body', async () => {
    const fetch = stubFetch(200, { items: [] });
    await expect(requestJson('https://example.test/x')).resolves.toEqual({ items: [] });
    expect(fetch).toHaveBeenCalledWith('https://example.test/x', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      signal: undefined,
    });
  });

  it('reads the error envelope', async () => {
    stubFetch(400, { status: 'error', errors: [{ type: 'error', code: 400, value: 'q needs at least 2 characters', reason: 'tooShort', field: 'q' }] });
    const error = await requestJson<never>('https://example.test/x').catch((caught: ApiError) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.reason, error.field, error.message]).toEqual([400, 'tooShort', 'q', 'q needs at least 2 characters']);
  });

  it('treats a 401 or a login redirect as an expired session', async () => {
    stubFetch(401, { errors: [{ value: 'Not logged in', reason: 'notLoggedIn' }] });
    expect((await requestJson<never>('https://example.test/x').catch((caught: ApiError) => caught)).sessionExpired).toBe(true);
    stubFetch(200, {}, true);
    expect((await requestJson<never>('https://example.test/x').catch((caught: ApiError) => caught)).sessionExpired).toBe(true);
  });
});
