import { describe, expect, it, vi } from 'vitest';
import type { PiletApi } from '@silverstripe/admin-shell';
import { createElementalApi } from './api';

const controllerUrl = 'https://example.test/admin/elemental-area/';

describe('createElementalApi', () => {
  it('reads the area from api/readElements', async () => {
    const fetchJson = vi.fn(async () => [{ id: 1 }]);
    const api = createElementalApi(controllerUrl, fetchJson as unknown as PiletApi['fetchJson']);
    const signal = new AbortController().signal;
    expect(await api.readElements(21, signal)).toEqual([{ id: 1 }]);
    expect(fetchJson).toHaveBeenCalledWith('https://example.test/admin/elemental-area/api/readElements/21', { signal });
  });

  it('posts writes through the shell\'s fetchJson, which sends the token', async () => {
    const fetchJson = vi.fn(async () => null);
    const api = createElementalApi(controllerUrl, fetchJson as unknown as PiletApi['fetchJson']);
    await api.sort(5, 3);
    await api.create('App\\Blocks\\QuoteBlock', 21);
    await api.archive(5);
    expect(fetchJson.mock.calls).toEqual([
      ['https://example.test/admin/elemental-area/api/sort', { method: 'POST', body: { id: 5, afterBlockID: 3 } }],
      ['https://example.test/admin/elemental-area/api/create', { method: 'POST', body: { elementClass: 'App\\Blocks\\QuoteBlock', elementalAreaID: 21 } }],
      ['https://example.test/admin/elemental-area/api/delete', { method: 'POST', body: { id: 5 } }],
    ]);
  });

  it('passes the shell\'s error on, with its reason and session expiry', async () => {
    const refused = Object.assign(new Error('Sorry, you do not have permission'), { name: 'ServerRequestError', status: 403, sessionExpired: false, reason: 'forbidden' });
    const api = createElementalApi(controllerUrl, (async () => {
      throw refused;
    }) as unknown as PiletApi['fetchJson']);
    await expect(api.publish(5)).rejects.toBe(refused);
  });
});
