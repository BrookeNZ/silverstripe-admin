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
): Pick<FormField, 'maxLength' | 'emptyOption' | 'headingLevel' | 'primary' | 'buttonLabel' | 'panelTitle' | 'placement'> {
  return {
    buttonLabel: typeof data.buttonTooltip === 'string' ? data.buttonTooltip : null,
    panelTitle: typeof data.popoverTitle === 'string' ? data.popoverTitle : null,
    placement: data.placement === 'top' || data.placement === 'bottom' ? data.placement : null,
    maxLength: typeof data.maxlength === 'number' ? data.maxlength : null,
    emptyOption: data.hasEmptyDefault ? String(data.emptyString ?? '') : null,
    headingLevel: typeof data.headingLevel === 'number' ? data.headingLevel : null,
    primary: /\bbtn--primary\b|\bbtn-primary\b/.test(schema.extraClass ?? ''),
  };
}

export function mergeFields(fields: Array<FieldSchema>, state: FormSchemaState | undefined): Array<FormField> {
  const stateById = new Map<string, FieldState>((state?.fields ?? []).map((field) => [field.id, field]));

  const merge = (schema: FieldSchema): FormField => {
    const fieldState = stateById.get(schema.id);
    const data = { ...asData(schema.data), ...asData(fieldState?.data) };
    return {
      ...schema,
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

async function readResponse(response: Response): Promise<FormSchemaResponse> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`The form endpoint answered ${response.status}`);
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
