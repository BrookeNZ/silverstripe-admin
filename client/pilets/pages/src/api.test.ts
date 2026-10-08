import { describe, expect, it, vi } from 'vitest';
import { ApiError, createTreeApi, toApiError } from './api';
import type { JsonRequest } from './api';

describe('createTreeApi', () => {
  it('reads the endpoints through the request it is given', async () => {
    const request = vi.fn(async () => ({}));
    const api = createTreeApi('https://example.test/admin/pages/tree/', request as JsonRequest);
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
    const expired = Object.assign(new Error('Your session may have expired'), { name: 'ServerRequestError', status: 403, sessionExpired: true });
    const api = createTreeApi('https://example.test/admin/pages/tree/', (async () => {
      throw expired;
    }) as JsonRequest);
    const error = (await api.children(0, 1, 50).catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.sessionExpired, error.message]).toEqual([403, true, 'Your session may have expired']);
  });
});

describe('toApiError', () => {
  it('keeps the reason and field of the endpoint\'s envelope', () => {
    const error = toApiError(
      Object.assign(new Error('q needs at least 2 characters'), { name: 'ServerRequestError', status: 400, sessionExpired: false, reason: 'tooShort', field: 'q' }),
    );
    expect([error.status, error.reason, error.field, error.message]).toEqual([400, 'tooShort', 'q', 'q needs at least 2 characters']);
  });

  it('names an ended session and a failure with no status', () => {
    expect(toApiError(Object.assign(new Error('expired'), { name: 'ServerRequestError', status: 403, sessionExpired: true }))).toMatchObject({
      reason: 'notLoggedIn',
      sessionExpired: true,
    });
    expect(toApiError(new TypeError('Failed to fetch'))).toMatchObject({ status: 0, reason: 'network', sessionExpired: false });
  });
});
