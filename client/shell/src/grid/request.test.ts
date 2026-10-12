import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerRequestError, fetchJson, sessionExpiredMessage } from '../state/serverRequest';
import type * as ServerRequestModule from '../state/serverRequest';
import { errorMessage, requestGrid } from './request';

vi.mock('../state/serverRequest', async (importOriginal) => ({
  ...(await importOriginal<typeof ServerRequestModule>()),
  fetchJson: vi.fn(),
}));

afterEach(() => {
  vi.mocked(fetchJson).mockReset();
});

describe('errorMessage', () => {
  it('reads an ended session from a 401 or a 403 asking to reauthenticate', () => {
    expect(errorMessage(401)).toBe(sessionExpiredMessage);
    expect(errorMessage(403, true)).toBe(sessionExpiredMessage);
  });

  it('reads a plain 403 as a missing permission', () => {
    expect(errorMessage(403)).toBe('You do not have permission to see this list.');
  });

  it('names the status for anything else', () => {
    expect(errorMessage(500)).toBe('The grid could not be loaded (500).');
  });
});

describe('requestGrid', () => {
  it('prefers what the server said', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new ServerRequestError('No delete permissions', 403, false, 'No delete permissions'));
    await expect(requestGrid('/admin/grid')).rejects.toMatchObject({ message: 'No delete permissions', status: 403 });
  });

  it('keeps the session expiry and shows the grid\'s message for a bare status', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new ServerRequestError(sessionExpiredMessage, 403, true));
    const expired = await requestGrid('/admin/grid').catch((caught: unknown) => caught);
    expect(expired).toBeInstanceOf(ServerRequestError);
    expect(expired).toMatchObject({ message: sessionExpiredMessage, status: 403, sessionExpired: true, serverMessage: null });

    vi.mocked(fetchJson).mockRejectedValueOnce(new ServerRequestError('The server answered 403 from /admin/grid', 403));
    await expect(requestGrid('/admin/grid')).rejects.toMatchObject({
      message: 'You do not have permission to see this list.',
      sessionExpired: false,
    });
  });

  it('refuses an empty body', async () => {
    vi.mocked(fetchJson).mockResolvedValue(null);
    await expect(requestGrid('/admin/grid')).rejects.toMatchObject({ message: 'The grid could not be loaded (200).', status: 200 });
  });
});
