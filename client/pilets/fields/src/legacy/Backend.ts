/**
 * Stands in for the admin's lib/Backend: the GET the ported fields use, sent the way the legacy
 * client sent it (same-origin cookies, the ajax marker, and a rejection on any non-2xx answer)
 */
export const CSRF_HEADER = 'X-SecurityID';

export default {
  async get(endpoint: string, headers: Record<string, string> = {}): Promise<Response> {
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...headers },
    });
    if (!response.ok) {
      throw new Error(`${endpoint} answered ${response.status}`);
    }
    return response;
  },
};
