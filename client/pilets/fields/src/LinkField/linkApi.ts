/**
 * The linkfield module's JSON endpoints (LinkFieldController, `admin/linkfield`), found as the legacy
 * client found them: in the client config section `SilverStripe\LinkField\Controllers\LinkFieldController`
 * under `form.linkForm`.
 *
 * - `GET data?itemIDs[]=1&itemIDs[]=2` answers `{<id>: Link::getData()}`
 * - `GET schema/linkForm/<id>?typeKey=&ownerID=&ownerClass=&ownerRelation=` is the FormSchema of one
 *   link (id 0 with a type key to create one); the form posts to `linkForm/<id>`, which saves the link
 *   and, for a new link on a has_one, writes the owner's `<Relation>ID` itself
 * - `DELETE delete/<id>?owner...` archives a versioned link or deletes it; 204
 * - `POST sort` with JSON `{newLinkIDs: [...]}` sets `Sort` 1..n; 204
 *
 * Both writes check the CSRF token in `X-SecurityID`, which the shell's fetch sends.
 */
import Config from '../legacy/Config';
import { failedStatus, serverCache } from '../legacy/Backend';

/** The class the link records are announced under */
export const linkRecordClass = 'SilverStripe\\LinkField\\Models\\Link';

export interface LinkData {
  title: string;
  description: string;
  canDelete: boolean;
  versionState: string;
  typeKey: string;
  sort: number;
}

export interface LinkOwner {
  ownerID: number;
  ownerClass: string;
  ownerRelation: string;
  excludeLinkTextField?: boolean;
}

interface LinkFormConfig {
  schemaUrl: string;
  deleteUrl: string;
  dataUrl: string;
  sortUrl: string;
}

const controllerName = 'SilverStripe\\LinkField\\Controllers\\LinkFieldController';

const fallback: LinkFormConfig = {
  schemaUrl: 'admin/linkfield/schema/linkForm/',
  deleteUrl: 'admin/linkfield/delete/',
  dataUrl: 'admin/linkfield/data/',
  sortUrl: 'admin/linkfield/sort/',
};

export function linkFormConfig(): LinkFormConfig {
  const sections = Config.get('sections');
  const section = Array.isArray(sections) ? sections.find((entry) => entry?.name === controllerName) : undefined;
  return { ...fallback, ...(section?.form?.linkForm ?? {}) };
}

function endpoint(base: string, path: string, query: Record<string, string> = {}): URL {
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`.replace(/\/$/, ''), document.baseURI);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function ownerQuery(owner: LinkOwner): Record<string, string> {
  return { ownerID: String(owner.ownerID), ownerClass: owner.ownerClass, ownerRelation: owner.ownerRelation };
}

export function linkSchemaUrl(linkId: number, typeKey: string, owner: LinkOwner): string {
  const query: Record<string, string> = { typeKey, ...ownerQuery(owner) };
  if (owner.excludeLinkTextField) {
    query.excludeLinkTextField = '1';
  }
  const url = endpoint(linkFormConfig().schemaUrl, String(linkId), query);
  return url.pathname.replace(/^\//, '') + url.search;
}

/** The saved link's id, from the id of the FormSchema response `linkForm/<id>` sends back */
export function savedLinkId(responseId: string | undefined): number | null {
  const match = responseId?.match(/\/linkForm\/([0-9]+)/);
  return match ? Number(match[1]) : null;
}

export async function fetchLinkData(ids: number[], signal?: AbortSignal): Promise<Record<number, LinkData>> {
  const url = endpoint(linkFormConfig().dataUrl, '');
  for (const id of ids) {
    url.searchParams.append('itemIDs[]', String(id));
  }
  return (await serverCache().fetchJson<Record<number, LinkData> | null>(url.href, { signal })) ?? {};
}

/** What the field shows for a failed read of its links */
export function linkDataError(error: Error): string {
  const status = failedStatus(error);
  return status === null ? error.message : `The links could not be loaded (${status})`;
}

export async function deleteLink(id: number, owner: LinkOwner): Promise<void> {
  await serverCache().fetchJson(endpoint(linkFormConfig().deleteUrl, String(id), ownerQuery(owner)).href, { method: 'DELETE' });
}

export async function sortLinks(ids: number[]): Promise<void> {
  await serverCache().fetchJson(endpoint(linkFormConfig().sortUrl, '').href, { method: 'POST', body: { newLinkIDs: ids } });
}
