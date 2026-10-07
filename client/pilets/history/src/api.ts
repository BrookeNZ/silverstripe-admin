/**
 * Client for versioned-admin's HistoryViewerController (`admin/historyviewer`): `api/read` lists a
 * record's versions a page at a time, newest first, and `api/revert` rolls the record back to one. The
 * controller checks `canView` for a read and the CSRF token (`X-SecurityID`) and `canEdit` for a revert;
 * errors arrive in the CMS JSON envelope, which the shell's fetch turns into the thrown message.
 */
import type { PiletApi } from '@silverstripe/admin-shell';

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

/** `request` is the shell's `fetchJson`, which sends the session headers and the CSRF token on the revert */
export function createHistoryApi(endpoints: HistoryEndpoints, request: PiletApi['fetchJson']): HistoryApi {
  return {
    async read(recordClass, id, page, signal) {
      const body = await request<{ pageInfo?: { totalCount?: number }; versions?: Array<Version> } | null>(endpoints.read, {
        query: { id, dataClass: recordClass, page },
        signal,
      });
      return { totalCount: Number(body?.pageInfo?.totalCount ?? 0), versions: body?.versions ?? [] };
    },
    async revert(recordClass, id, toVersion) {
      await request(endpoints.revert, { method: 'POST', body: { id, dataClass: recordClass, toVersion } });
    },
  };
}
