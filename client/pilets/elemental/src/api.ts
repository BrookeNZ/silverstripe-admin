/**
 * Client for elemental's JSON endpoints under `admin/elemental-area/api/` (ElementalAreaController in
 * dnadesign/silverstripe-elemental), through the shell's `fetchJson`, which sends writes as JSON with the
 * CSRF token in `X-SecurityID`, as the legacy editor does. Create, duplicate, publish, unpublish, archive
 * and sort answer 204 with no body, so the caller re-reads the list. Failures are the shell's
 * ServerRequestError: the CMS JSON envelope's text and `reason`, or an ended session.
 */
import type { PiletApi } from '@silverstripe/admin-shell';


export interface BlockSchema {
  /** The block class with backslashes replaced by underscores, the `name` of its element type */
  typeName: string;
  actions: { edit?: string | null };
  /** The block's summary, plain text */
  content?: string | null;
  /** A thumbnail of the block's image, on blocks that have one */
  fileURL?: string | null;
  fileTitle?: string | null;
}

export interface Block {
  id: number;
  title: string | null;
  blockSchema: BlockSchema;
  obsoleteClassName: string | null;
  version: number;
  isPublished: boolean;
  isLiveVersion: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  canCreate: boolean;
}

export interface ElementalApi {
  readElements: (areaId: number, signal?: AbortSignal) => Promise<Array<Block>>;
  create: (elementClass: string, areaId: number, insertAfterElementID?: number) => Promise<void>;
  publish: (id: number) => Promise<void>;
  unpublish: (id: number) => Promise<void>;
  archive: (id: number) => Promise<void>;
  duplicate: (id: number) => Promise<void>;
  /** Puts the block after `afterBlockID`, or first when it is 0 */
  sort: (id: number, afterBlockID: number) => Promise<void>;
}

/** `controllerUrl` is the absolute URL of admin/elemental-area/; `request` is the shell's `fetchJson` */
export function createElementalApi(controllerUrl: string, request: PiletApi['fetchJson']): ElementalApi {
  const url = (path: string) => new URL(`api/${path}`, controllerUrl).href;
  const post = async (path: string, body: Record<string, unknown>) => {
    await request(url(path), { method: 'POST', body });
  };
  return {
    readElements: (areaId, signal) => request<Array<Block>>(url(`readElements/${areaId}`), { signal }),
    create: (elementClass, areaId, insertAfterElementID) =>
      post('create', {
        elementClass,
        elementalAreaID: areaId,
        ...(insertAfterElementID === undefined ? {} : { insertAfterElementID }),
      }),
    publish: (id) => post('publish', { id }),
    unpublish: (id) => post('unpublish', { id }),
    archive: (id) => post('delete', { id }),
    duplicate: (id) => post('duplicate', { id }),
    sort: (id, afterBlockID) => post('sort', { id, afterBlockID }),
  };
}
