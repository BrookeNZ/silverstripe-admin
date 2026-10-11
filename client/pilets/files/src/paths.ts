/**
 * The section's router paths, in legacy asset-admin's shape: `show/<folderId>` for a folder and
 * `show/<folderId>/edit/<fileId>` for a file open in the details panel (AssetAdmin::getFileEditLink). The view,
 * sort and page live in the query, each left out at its default, so the plain folder path is the gallery at title
 * A-Z on page 1; a file's path keeps the query of the folder it was opened from, so closing it goes back there.
 */
import { defaultSort, readSort } from './api';
import type { FileSort } from './api';

export type FolderView = 'gallery' | 'list';

export interface FolderQuery {
  view: FolderView;
  sort: FileSort;
  page: number;
}

/** A route or query value as a whole number at least `min`, else `fallback` */
export function wholeNumber(value: string | null | undefined, min: number, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }
  const number = Number(value);
  return number >= min ? number : fallback;
}

export function readFolderQuery(search: URLSearchParams): FolderQuery {
  return {
    view: search.get('view') === 'list' ? 'list' : 'gallery',
    sort: readSort(search.get('sort')),
    page: wholeNumber(search.get('page'), 1, 1),
  };
}

function withQuery(path: string, query: Partial<FolderQuery>): string {
  const search = new URLSearchParams();
  if (query.view === 'list') {
    search.set('view', 'list');
  }
  if (query.sort && query.sort !== defaultSort) {
    search.set('sort', query.sort);
  }
  if (query.page && query.page > 1) {
    search.set('page', String(query.page));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export function folderPath(routePrefix: string, folderId: number, query: Partial<FolderQuery> = {}): string {
  return withQuery(folderId === 0 ? `${routePrefix}/` : `${routePrefix}/show/${folderId}`, query);
}

export function fileEditPath(routePrefix: string, folderId: number, fileId: number, query: Partial<FolderQuery> = {}): string {
  return withQuery(`${routePrefix}/show/${folderId}/edit/${fileId}`, query);
}

/** The folder and file a route names; the file is null on a folder's own route */
export function readFileRoute(params: Readonly<Record<string, string | undefined>>): { folderId: number; fileId: number | null } {
  const fileId = wholeNumber(params.fileId, 1, 0);
  return { folderId: wholeNumber(params.folderId, 0, 0), fileId: fileId > 0 ? fileId : null };
}
