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

export type FormValues = Record<string, unknown>;

const jsonHeaders = {
  Accept: 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

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

/** The actions for the bar in their clean or changed form, from either legacy convention */
export function barActions(actions: Array<FormField>, dirty: boolean): Array<FormField> {
  return actionBarFields(withPristineState(dirty ? withChangedActions(actions) : actions, dirty));
}

/**
 * The actions laid out for the action bar: a top-level group becomes a row (the legacy MajorActions
 * button group), and each tab of a top-level tab set (the page form's "More options") becomes a
 * popover opened by an icon button, the design's options menu
 */
export function actionBarFields(actions: Array<FormField>): Array<FormField> {
  return actions.flatMap((action): Array<FormField> => {
    if (action.component === 'CompositeField') {
      return [{ ...action, component: 'FieldGroup', componentCandidates: ['FieldGroup'] }];
    }
    if (action.component === 'Tabs') {
      return action.children.map((tab) => ({
        ...tab,
        component: 'PopoverField',
        componentCandidates: ['PopoverField'],
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

export function defaultValues(valueFields: Array<FormField>): FormValues {
  return Object.fromEntries(valueFields.map((field) => [field.key, field.value]));
}

// Select fields built on react-select hold option objects, the shape FormSchema state sends them in
function postedValue(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'value' in value) {
    return postedValue(value.value);
  }
  return value == null ? '' : String(value);
}

export function encodeSubmission(valueFields: Array<FormField>, values: FormValues, action: string): URLSearchParams {
  const body = new URLSearchParams();
  for (const field of valueFields) {
    const value = values[field.key];
    const isMulti = field.name.endsWith('[]') || field.schemaType === 'MultiSelect';
    if (isMulti) {
      const name = field.name.endsWith('[]') ? field.name : `${field.name}[]`;
      for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
        body.append(name, postedValue(item));
      }
    } else if (typeof value === 'boolean') {
      body.append(field.name, value ? '1' : '0');
    } else {
      body.append(field.name, postedValue(value));
    }
  }
  body.append(action, '1');
  return body;
}

/** A form endpoint answer that is not a usable schema, with what the server said about it */
export class FormSchemaRequestError extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage: string | null,
    /** The CMS session has ended: LeftAndMain answers an XHR with 403 and `X-Reauthenticate` */
    readonly sessionEnded: boolean,
  ) {
    super(`The form endpoint answered ${status}`);
    this.name = 'FormSchemaRequestError';
  }
}

/**
 * The message in an error body: a JSON error's texts, or the first line of the plain-text error a
 * dev-mode site sends to XHR. HTML error pages carry nothing worth showing
 */
export function serverMessage(body: string, contentType: string | null): string | null {
  if (contentType?.includes('application/json')) {
    try {
      const data = JSON.parse(body);
      const texts = (Array.isArray(data?.errors) ? data.errors : [])
        .map((error: { value?: unknown }) => error?.value)
        .filter((value: unknown): value is string => typeof value === 'string' && value !== '');
      return texts.length > 0 ? texts.join(' ') : null;
    } catch {
      return null;
    }
  }
  const firstLine = body.trimStart().split('\n', 1)[0]?.trim() ?? '';
  return firstLine && !firstLine.startsWith('<') ? firstLine.slice(0, 300) : null;
}

async function readResponse(response: Response): Promise<FormSchemaResponse> {
  const contentType = response.headers.get('content-type');
  if (!response.ok || !contentType?.includes('application/json')) {
    const body = await response.text().catch(() => '');
    // A section the member cannot view redirects an XHR by header (AdminController::redirect) with a 200
    const status = response.headers.get('x-controllerurl') ? 403 : response.status;
    throw new FormSchemaRequestError(
      status,
      serverMessage(body, contentType),
      response.status === 401 || response.headers.get('x-reauthenticate') === '1',
    );
  }
  return response.json();
}

export async function fetchFormSchema(schemaUrl: string, signal?: AbortSignal): Promise<FormSchemaResponse> {
  const response = await fetch(new URL(schemaUrl, document.baseURI), {
    credentials: 'same-origin',
    headers: { ...jsonHeaders, 'X-Formschema-Request': 'schema,state,errors' },
    signal,
  });
  return readResponse(response);
}

export async function submitFormSchema(schema: FormSchemaTree, body: URLSearchParams): Promise<FormSchemaResponse> {
  const response = await fetch(new URL(schema.action, document.baseURI), {
    method: schema.method || 'POST',
    credentials: 'same-origin',
    headers: { ...jsonHeaders, 'X-Formschema-Request': 'state,errors' },
    body,
  });
  return readResponse(response);
}
