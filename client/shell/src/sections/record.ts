/**
 * The record edit route of a section: a GridField detail form at the legacy URL, which is what
 * GridFieldEditButton, GridFieldAddNewButton, `CMSEditLink()` and ModelAdmin's
 * `getCMSEditLinkForManagedDataObject()` produce, so bookmarks and stored links keep working:
 * `<section>[/<tab>]/EditForm/field/<grid>/item/<id|new>[/edit|/view]`.
 *
 * The form comes from `<item link>/schema` (GridFieldItemSchemaExtension in the admin module). The item
 * link always names the model tab for a ModelAdmin, because the server reads an unnamed one as a model
 * class.
 */
import type { FormSchemaRecord } from '../forms/types';
import type { SectionHeader } from '../header/state';
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
}

const itemActions = ['edit', 'view'];

export function recordRoute({ section, tab, unhandled }: SectionRoute): RecordRoute | null {
  const [form, field, grid, item, id, action, ...rest] = unhandled;
  if (form !== 'EditForm' || field !== 'field' || !grid || item !== 'item' || rest.length > 0) {
    return null;
  }
  if (action !== undefined && !itemActions.includes(action)) {
    return null;
  }
  const isNew = id === 'new';
  if (!isNew && !/^[1-9]\d*$/.test(id ?? '')) {
    return null;
  }
  return {
    section,
    tab,
    grid,
    id: isNew ? null : Number(id),
    itemUrl: [section.url, tab?.tab, 'EditForm/field', grid, 'item', id].filter(Boolean).join('/'),
  };
}

export function recordSchemaUrl(route: RecordRoute): string {
  return `${route.itemUrl}/schema`;
}

/** The grid the record belongs to: its model tab, or the section for a grid on a section's own form */
export function recordBackPath({ section, tab }: RecordRoute): string {
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
  const backTitle = route.tab?.title ?? route.section.title;
  return { title: recordTitle(route, record), backTo: recordBackPath(route), backLabel: `Back to ${midSentence(backTitle)}` };
}
