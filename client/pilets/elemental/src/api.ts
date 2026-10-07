/**
 * Client for elemental's JSON endpoints under `admin/elemental-area/api/` (ElementalAreaController in
 * dnadesign/silverstripe-elemental). Writes send the CSRF token in `X-SecurityID` and a JSON body, as the
 * legacy editor does. Create, duplicate, publish, unpublish, archive and sort answer 204 with no body,
 * so the caller re-reads the list; errors arrive in the CMS JSON envelope with a generic text.
 */

export interface BlockSchema {
  /** The block class with backslashes replaced by underscores, the `name` of its element type */
  typeName: string;
  actions: { edit?: string | null };
  /** The block's summary, plain text */
  content?: string | null;
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

export class ElementalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ElementalApiError';
  }
}

interface ErrorEnvelope {
  errors?: Array<{ value?: string }>;
}

export interface ElementalApi {
  readElements(areaId: number, signal?: AbortSignal): Promise<Array<Block>>;
  create(elementClass: string, areaId: number, insertAfterElementID?: number): Promise<void>;
  publish(id: number): Promise<void>;
  unpublish(id: number): Promise<void>;
  archive(id: number): Promise<void>;
  duplicate(id: number): Promise<void>;
  /** Puts the block after `afterBlockID`, or first when it is 0 */
  sort(id: number, afterBlockID: number): Promise<void>;
}

async function failure(response: Response): Promise<ElementalApiError> {
  let envelope: ErrorEnvelope = {};
  try {
    envelope = await response.json();
  } catch {
    // A PHP error page or an empty 403, not the envelope
  }
  return new ElementalApiError(envelope.errors?.[0]?.value || `The block endpoint answered ${response.status}`, response.status);
}

/** `controllerUrl` is the absolute URL of admin/elemental-area/ */
export function createElementalApi(controllerUrl: string, securityId: string, fetcher: typeof fetch = fetch): ElementalApi {
  const url = (path: string) => new URL(`api/${path}`, controllerUrl).href;
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetcher(url(path), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-SecurityID': securityId,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await failure(response);
    }
  };
  return {
    async readElements(areaId, signal) {
      const response = await fetcher(url(`readElements/${areaId}`), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal,
      });
      if (response.redirected) {
        throw new ElementalApiError('Your CMS session has expired', 401);
      }
      if (!response.ok) {
        throw await failure(response);
      }
      return response.json();
    },
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
