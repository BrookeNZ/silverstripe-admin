/**
 * The record edit route of a section: a GridField detail form at the legacy URL, which is what
 * GridFieldEditButton, GridFieldAddNewButton, `CMSEditLink()` and ModelAdmin's
 * `getCMSEditLinkForManagedDataObject()` produce, so bookmarks and stored links keep working:
 * `<section>[/<tab>]/EditForm/field/<grid>/item/<id|new>[/edit|/view]`. A grid inside a record form
 * nests another `ItemEditForm/field/<grid>/item/<id|new>` before the action, to any depth.
 *
 * The form comes from `<item link>/schema` (GridFieldItemSchemaExtension in the admin module). The item
 * link always names the model tab for a ModelAdmin, because the server reads an unnamed one as a model
 * class.
 */
import type { FormSchemaRecord } from '../forms/types';
import type { SectionHeader, SectionHeaderCrumb } from '../header/state';
import { midSentence, modelTabPath } from './resolve';
import type { ModelTab, SectionRoute, ShellSection } from './resolve';

export interface RecordRoute {
  section: ShellSection;
  tab: ModelTab | null;
  grid: string;
  /** The record ID, or null for a new record */
  id: number | null;
  /** The item link relative to the site base, without a trailing slash */
  itemUrl: string;
  /** The record whose form holds this record's grid; null for a record in a section's own grid */
  parent: RecordRoute | null;
}

const itemActions = ['edit', 'view'];

const recordId = /^[1-9]\d*$/;

export function recordRoute({ section, tab, unhandled }: SectionRoute): RecordRoute | null {
  const segments = [...unhandled];
  if (segments.length % 5 === 1) {
    const action = segments.pop();
    if (!itemActions.includes(action ?? '')) {
      return null;
    }
  }
  if (segments.length < 5 || segments.length % 5 !== 0) {
    return null;
  }

  let route: RecordRoute | null = null;
  let itemUrl = [section.url, tab?.tab].filter(Boolean).join('/');
  for (let start = 0; start < segments.length; start += 5) {
    const [form, field, grid, item, id] = segments.slice(start, start + 5);
    const isLast = start + 5 === segments.length;
    const isNew = id === 'new' && isLast;
    if (form !== (route ? 'ItemEditForm' : 'EditForm') || field !== 'field' || !grid || item !== 'item') {
      return null;
    }
    if (!isNew && !recordId.test(id)) {
      return null;
    }
    itemUrl = [itemUrl, form, 'field', grid, 'item', id].join('/');
    route = { section, tab, grid, id: isNew ? null : Number(id), itemUrl, parent: route };
  }
  return route;
}

export function recordSchemaUrl(route: RecordRoute): string {
  return `${route.itemUrl}/schema`;
}

/** Where the record's grid is: the parent record's form, its model tab, or the section's own form */
export function recordBackPath({ section, tab, parent }: RecordRoute): string {
  if (parent) {
    return `/${section.route}${parent.itemUrl.slice(section.url.length)}/edit/`;
  }
  return tab ? modelTabPath(section, tab) : `/${section.route}/`;
}

/**
 * A class's singular name for running text: title-cased words are lowered ("Site Banner" → "site
 * banner") and acronyms kept ("Redirected URL" → "redirected URL")
 */
export function sentenceCaseName(name: string): string {
  return name
    .split(' ')
    .map((word) => (/^[A-Z][a-z]/.test(word) ? word.toLowerCase() : word))
    .join(' ');
}

export function recordTitle(route: RecordRoute, record: FormSchemaRecord | null): string {
  if (route.id === null) {
    return record?.singularName ? `New ${sentenceCaseName(record.singularName)}` : 'New record';
  }
  return record?.title || `${route.tab?.title ?? route.section.title} #${route.id}`;
}

export function recordHeader(route: RecordRoute, record: FormSchemaRecord | null): SectionHeader {
  const backLabel = route.parent
    ? `Back to ${record?.parentTitle || 'parent record'}`
    : `Back to ${midSentence(route.tab?.title ?? route.section.title)}`;
  return { title: recordTitle(route, record), crumbs: recordCrumbs(route, record), backTo: recordBackPath(route), backLabel };
}

/** The model's list, then the record holding this record's grid; records further up are not known here */
export function recordCrumbs(route: RecordRoute, record: FormSchemaRecord | null): Array<SectionHeaderCrumb> {
  const { section, tab, parent } = route;
  const list = { label: tab?.title ?? section.title, to: tab ? modelTabPath(section, tab) : `/${section.route}/` };
  return parent ? [list, { label: record?.parentTitle || 'Parent record', to: recordBackPath(route) }] : [list];
}
