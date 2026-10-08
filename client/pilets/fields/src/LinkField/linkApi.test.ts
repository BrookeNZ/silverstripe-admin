// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectConfig } from '../legacy/Config';
import { connectServerCache } from '../legacy/Backend';
import type { ServerCache } from '../legacy/Backend';
import { fetchLinkData } from './linkApi';
import type { LinkData } from './linkApi';

const link = (title: string): LinkData => ({ title, description: '', canDelete: true, versionState: '', typeKey: 'external', sort: 1 });

const fetchJson = vi.fn();

beforeEach(() => {
  fetchJson.mockReset();
  connectServerCache({ fetchJson } as unknown as ServerCache);
  connectConfig({ getConfig: () => ({ sections: [] }) } as never);
});

describe('fetchLinkData', () => {
  it('reads the links asked for in the same task with one request and gives each caller its own', async () => {
    fetchJson.mockResolvedValue({ 1: link('One'), 2: link('Two'), 3: link('Three') });

    const [first, second] = await Promise.all([fetchLinkData([1, 2]), fetchLinkData([2, 3])]);

    expect(fetchJson).toHaveBeenCalledTimes(1);
    const url = new URL(fetchJson.mock.calls[0][0]);
    expect(url.pathname).toBe('/admin/linkfield/data');
    expect(url.searchParams.getAll('itemIDs[]')).toEqual(['1', '2', '3']);
    expect(Object.keys(first)).toEqual(['1', '2']);
    expect(Object.keys(second)).toEqual(['2', '3']);
    expect(second[3].title).toBe('Three');
  });

  it('makes a new request for links asked for later', async () => {
    fetchJson.mockResolvedValue({});
    await fetchLinkData([1]);
    await fetchLinkData([2]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('fails every caller when the request fails', async () => {
    fetchJson.mockRejectedValue(new Error('down'));
    const reads = [fetchLinkData([1]), fetchLinkData([2])];
    await expect(reads[0]).rejects.toThrow('down');
    await expect(reads[1]).rejects.toThrow('down');
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('a refused batch retries per field and only the refused field fails', async () => {
    const refused = Object.assign(new Error('Forbidden'), { name: 'ServerRequestError', status: 403, sessionExpired: false });
    fetchJson.mockImplementation((href: string) => {
      const ids = new URL(href).searchParams.getAll('itemIDs[]');
      return ids.includes('2') ? Promise.reject(refused) : Promise.resolve({ 1: link('One'), 3: link('Three') });
    });

    const reads = [fetchLinkData([1]), fetchLinkData([2]), fetchLinkData([3])];

    await expect(reads[0]).resolves.toEqual({ 1: link('One') });
    await expect(reads[1]).rejects.toBe(refused);
    await expect(reads[2]).resolves.toEqual({ 3: link('Three') });
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });

  it('does not retry when the session has expired', async () => {
    fetchJson.mockRejectedValue(Object.assign(new Error('expired'), { name: 'ServerRequestError', status: 403, sessionExpired: true }));
    const reads = [fetchLinkData([1]), fetchLinkData([2])];
    await expect(reads[0]).rejects.toThrow('expired');
    await expect(reads[1]).rejects.toThrow('expired');
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('stops listening for cancellation once the request settles', async () => {
    fetchJson.mockResolvedValue({ 1: link('One') });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await fetchLinkData([1], controller.signal);
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cancels the shared request only when every caller has', async () => {
    let signal: AbortSignal | undefined;
    fetchJson.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => undefined);
    });
    const first = new AbortController();
    const second = new AbortController();
    const reads = [fetchLinkData([1], first.signal), fetchLinkData([2], second.signal)];
    await Promise.resolve();

    first.abort();
    await expect(reads[0]).rejects.toBeDefined();
    expect(signal?.aborted).toBe(false);
    second.abort();
    await expect(reads[1]).rejects.toBeDefined();
    expect(signal?.aborted).toBe(true);
  });
});
