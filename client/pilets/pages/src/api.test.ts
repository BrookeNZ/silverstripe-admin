import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createTreeApi, requestJson } from './api';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown, redirected = false) {
  const fetch = vi.fn(async () => ({ ok: status < 300, status, redirected, json: async () => body }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('createTreeApi', () => {
  it('builds the endpoint URLs', async () => {
    const request = vi.fn(async (_url: string) => ({}));
    const api = createTreeApi('https://example.test/admin/pages/tree/', request as typeof requestJson);
    await api.children(0, 2, 250);
    await api.ancestors(12, 250);
    await api.search('a b');
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/admin/pages/tree/children/0?page=2&limit=250',
      'https://example.test/admin/pages/tree/ancestors/12?limit=250',
      'https://example.test/admin/pages/tree/search?q=a+b',
    ]);
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
