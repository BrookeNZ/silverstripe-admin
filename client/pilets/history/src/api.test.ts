import { describe, expect, it, vi } from 'vitest';
import { createHistoryApi, HistoryApiError } from './api';

const endpoints = {
  read: 'https://example.test/admin/historyviewer/api/read/',
  revert: 'https://example.test/admin/historyviewer/api/revert/',
};

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createHistoryApi', () => {
  it('reads a page of versions with the record class and id', async () => {
    const fetcher = vi.fn(async () => json(200, { pageInfo: { totalCount: 31 }, versions: [{ version: 31 }] }));
    const result = await createHistoryApi(endpoints, 'token', fetcher).read('Page', 7, 2);

    expect(result).toEqual({ totalCount: 31, versions: [{ version: 31 }] });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/admin/historyviewer/api/read/?id=7&dataClass=Page&page=2');
    expect(init.method).toBeUndefined();
  });

  it('posts a revert as JSON with the CSRF token', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await createHistoryApi(endpoints, 'token', fetcher).revert('Page', 7, 4);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(endpoints.revert);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-SecurityID']).toBe('token');
    expect(JSON.parse(String(init.body))).toEqual({ id: 7, dataClass: 'Page', toVersion: 4 });
  });

  it('raises the envelope message, or a generic one for an empty answer', async () => {
    const forbidden = createHistoryApi(endpoints, 't', async () => json(403, { errors: [{ value: 'Nope' }] }));
    await expect(forbidden.revert('Page', 7, 4)).rejects.toEqual(new HistoryApiError('Nope', 403));
    const empty = createHistoryApi(endpoints, 't', async () => new Response('', { status: 404 }));
    await expect(empty.read('Page', 7, 1)).rejects.toThrow('The history endpoint answered 404');
  });
});
