import { describe, expect, it, vi } from 'vitest';
import { createElementalApi, ElementalApiError } from './api';

function fetcher(response: { ok?: boolean; status?: number; body?: unknown } = {}) {
  return vi.fn(async () => ({
    ok: true,
    status: 204,
    redirected: false,
    json: async () => response.body,
    ...response,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('createElementalApi', () => {
  it('reads the area from api/readElements', async () => {
    const fetch = fetcher({ status: 200, body: [{ id: 1 }] });
    const api = createElementalApi('https://example.test/admin/elemental-area/', 'token', fetch);
    expect(await api.readElements(21)).toEqual([{ id: 1 }]);
    expect(fetch.mock.calls[0][0]).toBe('https://example.test/admin/elemental-area/api/readElements/21');
  });

  it('posts writes as JSON with the token in X-SecurityID', async () => {
    const fetch = fetcher();
    const api = createElementalApi('https://example.test/admin/elemental-area/', 'token', fetch);
    await api.sort(5, 3);
    await api.create('App\\Blocks\\QuoteBlock', 21);
    await api.archive(5);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.test/admin/elemental-area/api/sort');
    expect(init.method).toBe('POST');
    expect(init.headers['X-SecurityID']).toBe('token');
    expect(JSON.parse(init.body)).toEqual({ id: 5, afterBlockID: 3 });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ elementClass: 'App\\Blocks\\QuoteBlock', elementalAreaID: 21 });
    expect(fetch.mock.calls[2][0]).toBe('https://example.test/admin/elemental-area/api/delete');
  });

  it('throws the envelope text on an error', async () => {
    const fetch = fetcher({ ok: false, status: 403, body: { errors: [{ value: 'Sorry, you do not have permission' }] } });
    const api = createElementalApi('https://example.test/admin/elemental-area/', 'token', fetch);
    await expect(api.publish(5)).rejects.toEqual(new ElementalApiError('Sorry, you do not have permission', 403));
  });
});
