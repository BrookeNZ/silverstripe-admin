/**
 * Client for versioned-admin's HistoryViewerController (`admin/historyviewer`): `api/read` lists a
 * record's versions a page at a time, newest first, and `api/revert` rolls the record back to one. The
 * controller checks `canView` for a read and the CSRF token (`X-SecurityID`) and `canEdit` for a revert;
 * errors arrive in the CMS JSON envelope.
 */

export interface VersionMember {
  firstName: string | null;
  surname: string | null;
}

export interface Version {
  version: number;
  author: VersionMember;
  publisher: VersionMember;
  deleted: boolean;
  draft: boolean;
  published: boolean;
  liveVersion: boolean;
  latestDraftVersion: boolean;
  /** Server time, `Y-m-d H:i:s` */
  lastEdited: string;
}

export interface VersionPage {
  totalCount: number;
  versions: Array<Version>;
}

export interface HistoryEndpoints {
  /** Absolute URL of `api/read` */
  read: string;
  /** Absolute URL of `api/revert` */
  revert: string;
}

export interface HistoryApi {
  /** `page` counts from 1 */
  read(recordClass: string, id: number, page: number, signal?: AbortSignal): Promise<VersionPage>;
  revert(recordClass: string, id: number, toVersion: number): Promise<void>;
}

export class HistoryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HistoryApiError';
  }
}

async function failure(response: Response): Promise<HistoryApiError> {
  let envelope: { errors?: Array<{ value?: string }> } = {};
  try {
    envelope = await response.json();
  } catch {
    // An empty 403 or a PHP error page, not the envelope
  }
  return new HistoryApiError(envelope.errors?.[0]?.value || `The history endpoint answered ${response.status}`, response.status);
}

/** `securityId` is read for each revert, so a token rotated by logging in again is used */
export function createHistoryApi(endpoints: HistoryEndpoints, securityId: () => string, fetcher: typeof fetch = fetch): HistoryApi {
  return {
    async read(recordClass, id, page, signal) {
      const url = new URL(endpoints.read);
      url.searchParams.set('id', String(id));
      url.searchParams.set('dataClass', recordClass);
      url.searchParams.set('page', String(page));
      const response = await fetcher(url.href, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal,
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const body = await response.json();
      return { totalCount: Number(body?.pageInfo?.totalCount ?? 0), versions: body?.versions ?? [] };
    },
    async revert(recordClass, id, toVersion) {
      const response = await fetcher(endpoints.revert, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-SecurityID': securityId(),
        },
        body: JSON.stringify({ id, dataClass: recordClass, toVersion }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
    },
  };
}
