/**
 * Loading, merging and submitting a FormSchema form.
 *
 * Field names are PHP POST names (`ViewerMembers[]`), which the form library would read as paths, so
 * every field gets a safe key for the library and the PHP name is only used again when posting. State
 * is matched to schema by id because state drops the `[]` suffix from multi-value names.
 */
import type {
  FieldSchema,
  FieldState,
  FormField,
  FormSchemaResponse,
  FormSchemaState,
  FormSchemaTree,
  SchemaData,
  SchemaMessage,
} from './types';
import { serverHtmlPosts } from './serverHtml';
import { ServerRequestError, fetchJson } from '../state/serverRequest';
import type { ServerRequestInit, ServerRequestMethod } from '../state/serverRequest';

export type FormValues = Record<string, unknown>;

export function fieldKey(name: string): string {
  return name.replace(/[.[\]]/g, (char) => `_x${char.charCodeAt(0).toString(16)}_`);
}

function asData(data: SchemaData | [] | undefined): SchemaData {
  return Array.isArray(data) ? {} : (data ?? {});
}

/** Translates FormSchema conventions into the plain props the shared field components read */
function sharedFieldProps(
  schema: FieldSchema,
  data: SchemaData,
): Pick<FormField, 'maxLength' | 'emptyOption' | 'headingLevel' | 'primary' | 'icon' | 'buttonLabel' | 'panelTitle' | 'placement'> {
  return {
    buttonLabel: typeof data.buttonTooltip === 'string' ? data.buttonTooltip : null,
    panelTitle: typeof data.popoverTitle === 'string' ? data.popoverTitle : null,
    placement: data.placement === 'top' || data.placement === 'bottom' ? data.placement : null,
    maxLength: typeof data.maxlength === 'number' ? data.maxlength : null,
    emptyOption: data.hasEmptyDefault ? String(data.emptyString ?? '') : null,
    headingLevel: typeof data.headingLevel === 'number' ? data.headingLevel : null,
    primary: isPrimaryAction(schema.name, schema.extraClass ?? '', data),
    icon: typeof data.icon === 'string' ? data.icon : null,
  };
}

/**
 * The legacy FormAction's button style rule: `data.buttonStyle`, else a Bootstrap `btn-*` colour class
 * (`btn--primary`, which every FormAction carries, is not one), else primary for the save action and
 * for `ss-ui-action-constructive`
 */
function isPrimaryAction(name: string, extraClass: string, data: SchemaData): boolean {
  if (typeof data.buttonStyle === 'string') {
    return data.buttonStyle === 'primary';
  }
  const style = /(?:^|\s)btn-([a-z][a-z-]*)/.exec(extraClass)?.[1];
  if (style) {
    return style === 'primary';
  }
  return name === 'action_save' || /(?:^|\s)ss-ui-action-constructive(?:\s|$)/.test(extraClass);
}

function classList(value: unknown): Array<string> {
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

/**
 * The actions as they read once the form has unsaved changes. An action carrying the legacy
 * `data-text-alternate` attributes (the page form's Saved and Published) swaps to its alternate title,
 * icon and classes, as LeftAndMain's change tracking did, so "Saved" becomes a primary "Save"
 */
export function withChangedActions(actions: Array<FormField>): Array<FormField> {
  return actions.map((action) => {
    const children = withChangedActions(action.children);
    const attributes = action.attributes ?? {};
    const title = attributes['data-text-alternate'];
    if (typeof title !== 'string') {
      return { ...action, children };
    }
    const removed = classList(attributes['data-btn-alternate-remove']);
    const extraClass = [
      ...classList(action.extraClass).filter((name) => !removed.includes(name)),
      ...classList(attributes['data-btn-alternate-add']),
    ].join(' ');
    const icon = attributes['data-icon-alternate'];
    return {
      ...action,
      children,
      title,
      extraClass,
      icon: typeof icon === 'string' ? icon : action.icon,
      primary: isPrimaryAction(action.name, extraClass, action.data),
    };
  });
}

/**
 * The actions as the asset admin's file form draws them. An action whose state data carries the
 * `pristine*` and `dirty*` keys takes its title, icon and class from whichever set applies, as the legacy
 * `togglePristineState` transform did; publish stays dirty while the file is unpublished or modified
 */
export function withPristineState(actions: Array<FormField>, dirty: boolean): Array<FormField> {
  return actions.map((action) => {
    const children = withPristineState(action.children, dirty);
    const { data } = action;
    if (!['pristineTitle', 'dirtyTitle', 'pristineClass', 'dirtyClass'].some((key) => key in data)) {
      return { ...action, children };
    }
    const pristine = !dirty && (!('isPublished' in data) || (Boolean(data.isPublished) && !data.isModified));
    const classes = classList(action.extraClass).filter((name) => name !== data.pristineClass && name !== data.dirtyClass);
    const stateClass = pristine ? data.pristineClass : data.dirtyClass;
    const extraClass = [...classes, ...classList(stateClass)].join(' ');
    const title = pristine ? data.pristineTitle : data.dirtyTitle;
    const icon = pristine ? data.pristineIcon : data.dirtyIcon;
    return {
      ...action,
      children,
      title: typeof title === 'string' && title ? title : action.title,
      icon: typeof icon === 'string' && icon ? icon : action.icon,
      extraClass,
      primary: isPrimaryAction(action.name, extraClass, data),
    };
  });
}

/** The actions in their clean or changed form, from either legacy convention */
function actionStates(actions: Array<FormField>, dirty: boolean): Array<FormField> {
  return withPristineState(dirty ? withChangedActions(actions) : actions, dirty);
}

export function barActions(actions: Array<FormField>, dirty: boolean): Array<FormField> {
  return actionBarFields(actionStates(actions, dirty));
}

/** The actions as one row of buttons, for a dialog footer: groups and tab sets give up their buttons */
export function dialogActions(actions: Array<FormField>, dirty: boolean): Array<FormField> {
  const buttons = (fields: Array<FormField>): Array<FormField> =>
    fields.flatMap((field) => (field.children.length > 0 ? buttons(field.children) : [field]));
  return buttons(actionStates(actions, dirty));
}

/**
 * The actions laid out for the action bar: a top-level group becomes a row (the legacy MajorActions
 * button group), and each tab of a top-level tab set (the page form's "More options") becomes a
 * menu opened by an icon button, the design's options menu
 */
export function actionBarFields(actions: Array<FormField>): Array<FormField> {
  return actions.flatMap((action): Array<FormField> => {
    if (action.component === 'CompositeField') {
      return [{ ...action, component: 'FieldGroup', componentCandidates: ['FieldGroup'] }];
    }
    if (action.component === 'Tabs') {
      return action.children.map((tab) => ({
        ...tab,
        component: 'MenuField',
        componentCandidates: ['MenuField'],
        title: null,
        buttonLabel: typeof tab.title === 'string' ? tab.title : null,
        placement: 'top',
      }));
    }
    return [action];
  });
}

/**
 * FormSchema sends a title or description built from HTML as `{ html }`, which the legacy FormBuilder
 * rendered as markup. The shared components take text, so the markup is reduced to its text, links included
 */
export function schemaText<T>(value: T | { html: string }): T | string {
  if (value === null || typeof value !== 'object' || typeof (value as { html?: unknown }).html !== 'string') {
    return value as T;
  }
  const { html } = value as { html: string };
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, '');
  }
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

export function mergeFields(fields: Array<FieldSchema>, state: FormSchemaState | undefined): Array<FormField> {
  const stateById = new Map<string, FieldState>((state?.fields ?? []).map((field) => [field.id, field]));

  const merge = (schema: FieldSchema): FormField => {
    const fieldState = stateById.get(schema.id);
    const data = { ...asData(schema.data), ...asData(fieldState?.data) };
    return {
      ...schema,
      title: schemaText(schema.title),
      description: schemaText(schema.description),
      key: fieldKey(schema.name),
      value: fieldState?.value ?? null,
      message: fieldState?.message ?? null,
      data,
      source: fieldState?.source ?? schema.source ?? [],
      children: (schema.children ?? []).map(merge),
      ...sharedFieldProps(schema, data),
    };
  };

  return fields.map(merge);
}

/** The fields without those named, at any depth */
export function withoutFields(fields: Array<FormField>, names: ReadonlyArray<string>): Array<FormField> {
  if (names.length === 0) {
    return fields;
  }
  return fields
    .filter((field) => !names.includes(field.name))
    .map((field) => ({ ...field, children: withoutFields(field.children, names) }));
}

/**
 * Fields whose value is posted back: everything but structure, read-only fields and actions. A field
 * rendered from server HTML posts only when that HTML is a single plain control carrying its name
 */
export function isValueField(field: FormField): boolean {
  if (field.schemaType === 'Structural' || field.type === 'submit' || field.readOnly) {
    return false;
  }
  return field.fallback ? serverHtmlPosts(field.name, field.fallback.html) : true;
}

export function collectValueFields(fields: Array<FormField>): Array<FormField> {
  return fields.flatMap((field) => [...(isValueField(field) ? [field] : []), ...collectValueFields(field.children)]);
}

/**
 * The value field a server error names. Errors carry FormField::getName(), which drops the `[]` the
 * schema's posted name keeps for multi-value fields
 */
export function errorField(valueFields: Array<FormField>, name: string | null | undefined): FormField | undefined {
  return name ? valueFields.find((field) => field.name === name || field.name === `${name}[]`) : undefined;
}

const goodMessageTypes = new Set(['good', 'success']);

/** ValidationResult::TYPE_GOOD, or the success type a hook may send */
export function isGoodMessage(message: SchemaMessage): boolean {
  return goodMessageTypes.has(message.type);
}

/** A validation message can arrive both as an error and in the returned state; show each text once */
export function uniqueMessages(messages: Array<SchemaMessage>, shownInline: Array<SchemaMessage> = []): Array<SchemaMessage> {
  const seen = new Set(shownInline.map((message) => message.value));
  return messages.filter((message) => {
    if (seen.has(message.value)) {
      return false;
    }
    seen.add(message.value);
    return true;
  });
}

const textSchemaTypes = new Set(['String', 'Text', 'HTML', 'Integer', 'Decimal', 'Date', 'Time', 'Datetime']);

/**
 * A text input reports an emptied value as "", so a text field whose state is null starts as "" too;
 * otherwise typing and deleting would leave the form dirty. Both post as an empty value
 */
export function defaultValues(valueFields: Array<FormField>): FormValues {
  return Object.fromEntries(
    valueFields.map((field) => [
      field.key,
      field.value == null && field.schemaType !== null && textSchemaTypes.has(field.schemaType) ? '' : multiSelectValue(field),
    ]),
  );
}

/**
 * ListboxField's state sends its chosen options as `{ Title, Value }` objects, which its validator refuses
 * when posted; starting from the plain values ListboxField hands back keeps an untouched form valid and clean
 */
function multiSelectValue(field: FormField): unknown {
  if (field.schemaType !== 'MultiSelect' || !Array.isArray(field.value)) {
    return field.value;
  }
  return field.value.map((item) => (item !== null && typeof item === 'object' && 'Value' in item ? item.Value : item));
}

const optionKeys = new Set(['value', 'label', 'title', 'selected']);

/** A select option, as FormSchema state and SearchableDropdownField send them: a value with its label and nothing more */
function isOption(value: object): value is { value: unknown } {
  if (Array.isArray(value) || !('value' in value) || !('label' in value || 'title' in value)) {
    return false;
  }
  return Object.keys(value).every((key) => optionKeys.has(key));
}

const pad = (part: number) => String(part).padStart(2, '0');

/**
 * The HTML5 ISO formats DateField, DatetimeField and TimeField parse, in local wall-clock time as a native
 * input posts it; the server reads it in the field's own timezone, so a UTC `toISOString()` would not parse
 */
function postedDate(date: Date, schemaType: string | null): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (schemaType === 'Date') {
    return day;
  }
  return schemaType === 'Time' ? time : `${day}T${time}`;
}

function refuseFile(name: string): void {
  const message = `${name} holds a File, which a FormSchema submission cannot post; uploads send their own request`;
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * Appends a value under a PHP POST name the way the legacy admin's qs.stringify did: nested objects as
 * `Name[Key]`, an empty array and `undefined` as nothing, `null` as an empty value. Scalar lists post as
 * `Name[]`; a list holding objects keeps indices so each object's keys stay together when PHP parses them
 */
function appendValue(body: URLSearchParams, name: string, value: unknown, schemaType: string | null): void {
  if (value === undefined) {
    return;
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    refuseFile(name);
  } else if (value instanceof Date) {
    body.append(name, postedDate(value, schemaType));
  } else if (Array.isArray(value)) {
    const indexed = value.some((item) => item !== null && typeof item === 'object' && !isOption(item) && !(item instanceof Date));
    value.forEach((item, index) => appendValue(body, indexed ? `${name}[${index}]` : `${name}[]`, item, schemaType));
  } else if (value !== null && typeof value === 'object' && isOption(value)) {
    appendValue(body, name, value.value, schemaType);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      appendValue(body, `${name}[${key}]`, item, schemaType);
    }
  } else if (typeof value === 'boolean') {
    body.append(name, value ? '1' : '0');
  } else {
    body.append(name, value == null ? '' : String(value));
  }
}

/** The pressed action posts as `action_x=1`, as a native submit button would, which is how the form request handler picks the action */
export function encodeSubmission(valueFields: Array<FormField>, values: FormValues, action: string): URLSearchParams {
  const body = new URLSearchParams();
  for (const field of valueFields) {
    const value = values[field.key];
    const isMulti = field.name.endsWith('[]') || field.schemaType === 'MultiSelect';
    if (isMulti) {
      const name = field.name.endsWith('[]') ? field.name.slice(0, -2) : field.name;
      appendValue(body, name, Array.isArray(value) ? value : value == null ? [] : [value], field.schemaType);
    } else {
      appendValue(body, field.name, value, field.schemaType);
    }
  }
  body.append(action, '1');
  return body;
}

/**
 * A form endpoint answer that is not a usable schema, with what the server said about it. It keeps the
 * `ServerRequestError` name, which is how pilets recognise the shell's request failures
 */
export class FormSchemaRequestError extends ServerRequestError {
  constructor(
    status: number,
    serverMessage: string | null,
    /** The CMS session has ended: LeftAndMain answers an XHR with 403 and `X-Reauthenticate` */
    sessionExpired: boolean,
  ) {
    super(`The form endpoint answered ${status}`, status, sessionExpired, serverMessage);
  }
}

async function formRequest(url: string, init: ServerRequestInit): Promise<FormSchemaResponse> {
  try {
    return await fetchJson<FormSchemaResponse>(url, init);
  } catch (error) {
    if (error instanceof ServerRequestError) {
      throw new FormSchemaRequestError(error.status, error.serverMessage, error.sessionExpired);
    }
    throw error;
  }
}

/**
 * The query flag lets the request reuse the response of the preload the shell page carries for its first schema,
 * since a preload cannot send the header (LeftAndMain::PIRAL_SCHEMA_QUERY)
 */
export function fetchFormSchema(schemaUrl: string, signal?: AbortSignal): Promise<FormSchemaResponse> {
  return formRequest(schemaUrl, { headers: { 'X-Formschema-Request': 'schema,state,errors' }, query: { formSchema: 1 }, signal });
}

export function submitFormSchema(schema: FormSchemaTree, body: URLSearchParams): Promise<FormSchemaResponse> {
  const method = (schema.method || 'POST').toUpperCase() as ServerRequestMethod;
  return formRequest(schema.action, { method, headers: { 'X-Formschema-Request': 'state,errors' }, body });
}
