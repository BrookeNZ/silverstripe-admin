/**
 * Client for the read-only page tree endpoints at admin/pages/tree (PageTreeController in the admin
 * module): paged children, the path to a page, and search; and the add page endpoints at
 * admin/pages/create (PageCreateController): the types a parent accepts, and creating a page. Moving a
 * page is in move.ts. Every request goes through the shell's `fetchJson`, which sends the XHR and CSRF
 * headers and reports an ended session; its failures become an ApiError carrying the endpoint's reason.
 */
import type { PiletApi, ServerRequestError } from '@silverstripe/admin-shell';

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
  /** A virtual page's copied page class, which the drop rules check in place of its own */
  copiedClassName?: string;
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
    readonly sessionExpired: boolean = status === 401,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The shell's request failure; pilets get its type but not its class, so it is recognised by name */
export function isServerRequestError(error: unknown): error is ServerRequestError {
  return error instanceof Error && error.name === 'ServerRequestError';
}

/** Keeps what the shell's ServerRequestError carries; anything else is a request that got no answer */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (!isServerRequestError(error)) {
    return new ApiError(error instanceof Error ? error.message : String(error), 0, 'network');
  }
  const { message, status, sessionExpired, reason, field } = error;
  return new ApiError(message, status, reason ?? (sessionExpired ? 'notLoggedIn' : 'http'), field ?? null, sessionExpired);
}

/** The shell's `fetchJson` */
export type JsonRequest = PiletApi['fetchJson'];

/** Requests through the shell's `fetchJson`, failing with an ApiError */
export async function requestApi<T>(request: JsonRequest, url: string, init?: Parameters<JsonRequest>[1]): Promise<T> {
  try {
    return await request<T>(url, init);
  } catch (error: unknown) {
    throw toApiError(error);
  }
}

export interface TreeApi {
  children: (parentId: number, page: number, limit: number, signal?: AbortSignal) => Promise<ChildrenResponse>;
  ancestors: (id: number, limit: number) => Promise<AncestorsResponse>;
  search: (query: string, signal?: AbortSignal) => Promise<SearchResponse>;
}

/** `treeUrl` is the absolute URL of admin/pages/tree/, the url_segment of PageTreeController */
export function createTreeApi(treeUrl: string, request: JsonRequest): TreeApi {
  const read = <T>(path: string, query: Record<string, string | number>, signal?: AbortSignal): Promise<T> =>
    requestApi<T>(request, new URL(path, treeUrl).href, { query, signal });
  return {
    children: (parentId, page, limit, signal) => read(`children/${parentId}`, { page, limit }, signal),
    ancestors: (id, limit) => read(`ancestors/${id}`, { limit }),
    search: (query, signal) => read('search', { q: query }, signal),
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
  types: (parentId: number) => Promise<PageTypesResponse>;
  create: (parentId: number, className: string) => Promise<CreatedPage>;
}

/** `createUrl` is the absolute URL of admin/pages/create/, the url_segment of PageCreateController */
export function createPageApi(createUrl: string, request: JsonRequest): CreatePageApi {
  return {
    types: (parentId) => requestApi(request, new URL(`types/${parentId}`, createUrl).href),
    create: (parentId, className) =>
      requestApi(request, new URL('page', createUrl).href, { method: 'POST', body: { parentId, className } }),
  };
}
