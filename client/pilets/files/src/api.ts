/**
 * Client for asset-admin's read endpoint, `api/read/<folderId>` on the AssetAdmin section (AssetAdminOpen::apiRead,
 * inherited by AssetAdmin): one folder with its ancestors and a page of its children, folders first. The endpoint
 * pages by `page` (counting from 1) at a fixed page size and takes no limit; folder 0 is the root, which has no
 * title or ancestors. `sort` is the endpoint's `<field>,<direction>` pair over `title` or `lastEdited`, applied after
 * the folders-first order; anything else is a 404.
 */
import type { PiletApi } from '@silverstripe/admin-shell';

export const fileClass = 'SilverStripe\\Assets\\File';

// AssetAdminOpen::$page_length
export const pageSize = 50;

export interface FileItem {
  id: number;
  title: string;
  type: 'folder' | 'file';
  category: string | null;
  extension: string;
  /** The gallery-sized thumbnail; null for a folder, a file that is not an image, or an image not yet resized */
  thumbnail: string | null;
  /** Formatted by the server ("13 KB"); null for a folder */
  size: string | null;
  /** The server's `Y-m-d H:i:s` last edited time */
  lastEdited: string | null;
  /** Only on draft, never published */
  draft: boolean;
}

export interface FolderCrumb {
  id: number;
  title: string;
}

export interface FolderListing {
  id: number;
  /** Null for the root */
  title: string | null;
  /** From the top-level folder down to the parent */
  ancestors: Array<FolderCrumb>;
  items: Array<FileItem>;
  totalCount: number;
  /** The page shown, which is the last page when the one asked for is past the end */
  page: number;
  /** The page asked for */
  requestedPage: number;
  pageCount: number;
}

interface ReadNode {
  id?: number;
  title?: string | null;
  name?: string | null;
  type?: string;
  category?: string | null;
  extension?: string | null;
  thumbnail?: string | null;
  size?: string | null;
  lastEdited?: string | null;
  draft?: boolean;
  ancestors?: Array<ReadNode>;
  children?: { pageInfo?: { totalCount?: number }; nodes?: Array<ReadNode> };
}

/** A node's label: its title, else its file name, as legacy showed it */
function nodeTitle(node: ReadNode): string {
  return node.title || node.name || '';
}

function toItem(node: ReadNode): FileItem {
  const isFolder = node.type === 'folder';
  return {
    id: Number(node.id),
    title: nodeTitle(node),
    type: isFolder ? 'folder' : 'file',
    category: node.category ?? null,
    extension: node.extension ?? '',
    thumbnail: node.thumbnail || null,
    size: isFolder ? null : node.size || null,
    lastEdited: node.lastEdited || null,
    draft: Boolean(node.draft),
  };
}

/** The section's sort in the page URL: a field, descending when it starts with `-`, as GridField's grid writes it */
export type FileSort = 'title' | '-title' | 'lastEdited' | '-lastEdited';

// The endpoint's own order when it is sent none
export const defaultSort: FileSort = 'title';

// Legacy's AssetAdmin.FILTER_* labels in sentence case, in legacy's order
export const sortOptions: ReadonlyArray<{ sort: FileSort; label: string }> = [
  { sort: 'title', label: 'Title A-Z' },
  { sort: '-title', label: 'Title Z-A' },
  { sort: '-lastEdited', label: 'Newest' },
  { sort: 'lastEdited', label: 'Oldest' },
];

export function readSort(value: string | null | undefined): FileSort {
  return sortOptions.find((option) => option.sort === value)?.sort ?? defaultSort;
}

export function sortLabel(sort: FileSort): string {
  return sortOptions.find((option) => option.sort === sort)?.label ?? sortOptions[0].label;
}

/** The read endpoint's `sort` value for a URL sort */
export function endpointSort(sort: FileSort): string {
  return sort.startsWith('-') ? `${sort.slice(1)},desc` : `${sort},asc`;
}

/** `endpoint` is the section's `endpoints.read.url`, made absolute; the default sort is left to the endpoint */
export function readFolderUrl(endpoint: string, folderId: number, page: number, sort: FileSort = defaultSort): string {
  const url = new URL(String(folderId), endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  url.searchParams.set('page', String(page));
  if (sort !== defaultSort) {
    url.searchParams.set('sort', endpointSort(sort));
  }
  return url.href;
}

export async function readFolder(
  request: PiletApi['fetchJson'],
  endpoint: string,
  folderId: number,
  page: number,
  sort: FileSort,
  signal?: AbortSignal,
): Promise<FolderListing> {
  const read = async (shown: number): Promise<FolderListing> => {
    const body = await request<ReadNode | null>(readFolderUrl(endpoint, folderId, shown, sort), { signal });
    const totalCount = Number(body?.children?.pageInfo?.totalCount ?? 0);
    return {
      id: folderId,
      title: folderId === 0 ? null : nodeTitle(body ?? {}),
      ancestors: (body?.ancestors ?? []).map((node) => ({ id: Number(node.id), title: nodeTitle(node) })),
      items: (body?.children?.nodes ?? []).map(toItem),
      totalCount,
      page: shown,
      requestedPage: page,
      pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  };
  const listing = await read(page);
  return listing.page > listing.pageCount ? read(listing.pageCount) : listing;
}

/** Keyed under File with the folder id, so an event for the folder or any listed file refetches the page */
export function folderKey(folderId: number, page: number, sort: FileSort) {
  return [fileClass, folderId, 'children', sort, page] as const;
}

export function folderRecords(listing: FolderListing): Array<number> {
  return listing.items.map((item) => item.id);
}
