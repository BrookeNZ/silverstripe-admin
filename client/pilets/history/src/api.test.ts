import { describe, expect, it, vi } from 'vitest';
import { createHistoryApi } from './api';

const endpoints = {
  read: 'https://example.test/admin/historyviewer/api/read/',
  revert: 'https://example.test/admin/historyviewer/api/revert/',
};

describe('createHistoryApi', () => {
  it('reads a page of versions with the record class and id', async () => {
    const request = vi.fn(async () => ({ pageInfo: { totalCount: 31 }, versions: [{ version: 31 }] }));
    const signal = new AbortController().signal;
    const result = await createHistoryApi(endpoints, request as never).read('Page', 7, 2, signal);

    expect(result).toEqual({ totalCount: 31, versions: [{ version: 31 }] });
    expect(request).toHaveBeenCalledWith(endpoints.read, { query: { id: 7, dataClass: 'Page', page: 2 }, signal });
  });

  it('reads an empty answer as no versions', async () => {
    const result = await createHistoryApi(endpoints, (async () => null) as never).read('Page', 7, 1);
    expect(result).toEqual({ totalCount: 0, versions: [] });
  });

  it('posts a revert through the shell fetch, which adds the CSRF token', async () => {
    const request = vi.fn(async () => null);
    await createHistoryApi(endpoints, request as never).revert('Page', 7, 4);

    expect(request).toHaveBeenCalledWith(endpoints.revert, { method: 'POST', body: { id: 7, dataClass: 'Page', toVersion: 4 } });
  });

  it('passes the shell fetch error on', async () => {
    const failure = Object.assign(new Error('Nope'), { status: 403 });
    const api = createHistoryApi(endpoints, (async () => {
      throw failure;
    }) as never);
    await expect(api.revert('Page', 7, 4)).rejects.toBe(failure);
  });
});
