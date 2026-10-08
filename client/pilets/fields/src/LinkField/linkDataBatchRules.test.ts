// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectConfig } from '../legacy/Config';
import { connectServerCache } from '../legacy/Backend';
import type { ServerCache } from '../legacy/Backend';
import { fetchLinkData } from './linkApi';

const fetchJson = vi.fn();

beforeEach(() => {
  fetchJson.mockReset();
  connectServerCache({ fetchJson } as unknown as ServerCache);
  connectConfig({ getConfig: () => ({ sections: [] }) } as never);
});

const settled = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => 'resolved', () => 'rejected'), new Promise((resolve) => setTimeout(() => resolve('pending'), 20))]);

describe('fetchLinkData batching rules', () => {
  it('settles a read cancelled before the batch is sent', async () => {
    fetchJson.mockResolvedValue({ 2: { title: 'Two' } });
    const cancelled = new AbortController();
    const first = fetchLinkData([1], cancelled.signal);
    const second = fetchLinkData([2]);
    cancelled.abort();

    expect(await second).toEqual({ 2: { title: 'Two' } });
    expect(await settled(first)).toBe('rejected');
  });

  it('keeps one field out of another field batch when the ids do not overlap', async () => {
    fetchJson.mockResolvedValue({ 1: { title: 'One' }, 9: { title: 'Nine' } });
    const [first, second] = await Promise.all([fetchLinkData([1]), fetchLinkData([9])]);
    expect(first).toEqual({ 1: { title: 'One' } });
    expect(second).toEqual({ 9: { title: 'Nine' } });
  });

  it('starts an empty collector for the next task', async () => {
    fetchJson.mockResolvedValue({});
    await Promise.all([fetchLinkData([1]), fetchLinkData([2])]);
    await fetchLinkData([3]);
    const last = new URL(fetchJson.mock.calls[1][0]);
    expect(last.searchParams.getAll('itemIDs[]')).toEqual(['3']);
  });
});
