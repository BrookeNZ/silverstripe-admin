/**
 * Client for the read-only page tree endpoints at admin/pages/tree (PageTreeController in the admin
 * module): paged children, the path to a page, and search; and the add page endpoints at admin/pages/create
 * (PageCreateController): the types a parent accepts, and creating a page, which sends the CSRF token. Requests are sent the way the shell sends its
 * feed request, so the server answers an expired session with a JSON 401 rather than a login redirect.
 * Failures carry the endpoint's error envelope as an ApiError.
 */

export interface StatusFlag {
  key: string;
  text: string;
  title: string | null;
}

export interface PageNode {
  id: number;
  parentId: number;
  title: string;
  menuTitle: string;
  urlSegment: string;
  className: string;
  hasChildren: boolean;
  childCount: number;
  statusFlags: Array<StatusFlag>;
  canEdit: boolean;
  canDelete: boolean;
  sort: number;
}

export interface PageInfo {
  totalCount: number;
  pageSize: number;
  page: number;
  hasMore: boolean;
}

export interface ChildrenResponse {
  items: Array<PageNode>;
  pageInfo: PageInfo;
}

export interface AncestorsResponse {
  /** From the top-level ancestor down to the parent; `page` is the page of its parent's children it is on */
  items: Array<PageNode & { page: number | null }>;
  node: { id: number; parentId: number; page: number | null };
  pageSize: number;
}

export interface SearchResponse {
  items: Array<PageNode & { ancestorIds: Array<number> }>;
  pageInfo: PageInfo;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string,
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get sessionExpired(): boolean {
    return this.status === 401;
  }
}

interface ErrorEnvelope {
  errors?: Array<{ value?: string; reason?: string; field?: string }>;
}

export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal,
  });
  if (response.redirected) {
    throw new ApiError('Not logged in', 401, 'notLoggedIn');
  }
  if (!response.ok) {
    let envelope: ErrorEnvelope = {};
    try {
      envelope = await response.json();
    } catch {
      // A proxy or PHP fatal error page, not the endpoint's envelope
    }
    const error = envelope.errors?.[0];
    throw new ApiError(
      error?.value || `The page tree answered ${response.status}`,
      response.status,
      error?.reason ?? 'http',
      error?.field ?? null,
    );
  }
  return response.json();
}

export interface TreeApi {
  children(parentId: number, page: number, limit: number): Promise<ChildrenResponse>;
  ancestors(id: number, limit: number): Promise<AncestorsResponse>;
  search(query: string, signal?: AbortSignal): Promise<SearchResponse>;
}

/** `treeUrl` is the absolute URL of admin/pages/tree/, the url_segment of PageTreeController */
export function createTreeApi(treeUrl: string, request: typeof requestJson = requestJson): TreeApi {
  const url = (path: string, query: Record<string, string | number>) => {
    const target = new URL(path, treeUrl);
    for (const [name, value] of Object.entries(query)) {
      target.searchParams.set(name, String(value));
    }
    return target.href;
  };
  return {
    children: (parentId, page, limit) => request(url(`children/${parentId}`, { page, limit })),
    ancestors: (id, limit) => request(url(`ancestors/${id}`, { limit })),
    search: (query, signal) => request(url('search', { q: query }), signal),
  };
}

export interface PageType {
  className: string;
  title: string;
  description: string;
  /** The legacy `cms_icon_class` font icon; null when a `cms_icon` image replaces the default */
  iconClass: string | null;
  /** The `cms_icon` image, which may be a data URI */
  iconUrl: string | null;
}

export interface PageTypesResponse {
  parent: { id: number; title: string } | null;
  types: Array<PageType>;
  defaultType: string | null;
}

export interface CreatedPage {
  id: number;
  parentId: number;
  className: string;
  title: string;
}

export interface CreatePageApi {
  types(parentId: number): Promise<PageTypesResponse>;
  create(parentId: number, className: string): Promise<CreatedPage>;
}

/** `createUrl` is the absolute URL of admin/pages/create/, the url_segment of PageCreateController */
export function createPageApi(createUrl: string, securityId: () => string, fetcher: typeof fetch = fetch): CreatePageApi {
  return {
    types: (parentId) => requestJson(new URL(`types/${parentId}`, createUrl).href),
    async create(parentId, className) {
      const response = await fetcher(new URL('page', createUrl).href, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-SecurityID': securityId(),
        },
        body: JSON.stringify({ parentId, className }),
      });
      if (response.redirected) {
        throw new ApiError('Not logged in', 401, 'notLoggedIn');
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = (body as ErrorEnvelope).errors?.[0];
        throw new ApiError(error?.value || `Creating the page answered ${response.status}`, response.status, error?.reason ?? 'http');
      }
      return body as CreatedPage;
    },
  };
}
