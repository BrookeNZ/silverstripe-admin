/**
 * Pilet API v1 form types: the FormSchema payload as LeftAndMain and FormSchema send it (schema, state
 * and errors parts), the field the shell renders from it, and the props a registered field component
 * receives. Published to pilets through the emulator (`extraTypes` in package.json); PILET-API.md is the
 * reference.
 *
 * The props contract itself (`FieldProps`) belongs to @silverstripe/admin-patterns, which knows
 * nothing about FormSchema; `FieldComponentProps` narrows it to a FormSchema field.
 */
import type { ChoiceOption, FieldDescriptor, FieldProps } from '@silverstripe/admin-patterns';

export type { ChoiceOption, FieldDescriptor, FieldProps };

export type SourceOption = ChoiceOption;

export interface SchemaMessage {
  value: string;
  type: string;
  field?: string;
}

export type SchemaData = Record<string, unknown>;

export interface FieldSchema {
  name: string;
  id: string;
  type: string | null;
  schemaType: string | null;
  component: string | null;
  /**
   * Registry names to try, most specific first: class names up to FormField, each followed by the
   * component name that class declares. Sent by the admin module only while the shell flag is on
   */
  componentCandidates?: Array<string>;
  holderId?: string;
  title: string | number | boolean | null;
  description?: string | null;
  rightTitle?: string | null;
  leftTitle?: string | null;
  extraClass?: string;
  readOnly: boolean;
  disabled: boolean;
  autoFocus?: boolean;
  attributes?: SchemaData;
  source?: Array<SourceOption> | null;
  // PHP serialises an empty data map as []
  data: SchemaData | [];
  children?: Array<FieldSchema>;
  /**
   * The field's server-rendered holder HTML, sent by the admin module (while the shell flag is on) for
   * a field that names neither a component nor a schemaType. Transitional
   */
  fallback?: { html: string };
}

export interface FieldState {
  name: string;
  id: string;
  value: unknown;
  message: SchemaMessage | null;
  data: SchemaData | [];
  source?: Array<SourceOption>;
}

export interface FormSchemaTree {
  name: string;
  id: string;
  action: string;
  method: string;
  attributes: SchemaData;
  fields: Array<FieldSchema>;
  actions: Array<FieldSchema>;
}

export interface FormSchemaState {
  id: string;
  fields: Array<FieldState>;
  messages: Array<SchemaMessage>;
  notifyUnsavedChanges?: boolean;
}

/**
 * The record a GridField detail form edits, sent beside the form by its schema endpoint and by each
 * successful submission (`<item link>/schema`, GridFieldItemSchemaExtension)
 */
export interface FormSchemaRecord {
  /** Null for a record not yet saved */
  id: number | null;
  className: string;
  title: string | null;
  singularName: string | null;
  /** The record's edit link; null for a new record, or once the record has left the grid's list */
  link: string | null;
}

export interface FormSchemaResponse {
  id: string;
  schema?: FormSchemaTree;
  state?: FormSchemaState;
  errors?: Array<SchemaMessage>;
  record?: FormSchemaRecord;
  /** A detail form submission that removed the record (delete, archive) */
  deleted?: boolean;
  /** A detail form submission's success message, as plain text */
  message?: string;
}

/** A schema field merged with its state, keyed for the form library */
export interface FormFieldBase
  extends Omit<FieldSchema, 'children' | 'data' | 'source'>,
    Omit<FieldDescriptor, 'children' | 'source' | 'title'> {
  key: string;
  value: unknown;
  message: SchemaMessage | null;
  data: SchemaData;
  source: Array<SourceOption>;
  children: Array<FormField>;
}

/**
 * A FormSchema field with its schema-level props typed. Fields such as SearchableDropdownField send
 * their own props at the top level of the schema entry (`optionUrl`, `lazyLoad`); name them in `P`
 */
export type FormField<P extends object = {}> = FormFieldBase & Partial<P>;

export interface FormFieldActions {
  /**
   * Sets another field's value by its posted name, as FormBuilder's `onAutofill` did; for a field
   * that drives hidden companions, such as a focus point picker writing its X and Y fields. Names
   * that are not posted are ignored
   */
  autofill(name: string, value: unknown): void;
}

/** Where a field is rendered */
export interface FormFieldContext {
  /** The id of the form element the field is in (`Form_EditForm`), the key for `registerBeforeSubmit` */
  formId?: string;
}

/** What a field component registered with the Pilet API receives */
export type FieldComponentProps<V = unknown, P extends object = {}> = FieldProps<V, FormField<P>> & FormFieldActions & FormFieldContext;

/** What FormSchemaForm's `handleRef` receives */
export interface FormSchemaFormHandle {
  /** Posts the form with the named action (the first action, else `action_save`, when omitted) */
  submit(action?: string): Promise<FormSchemaSubmitResult>;
  isDirty(): boolean;
}

export interface FormSchemaSubmitResult {
  /** True when the server accepted the submission with no errors */
  ok: boolean;
  response?: FormSchemaResponse;
  /** Why it failed, when the request itself failed or a before-submit handler threw */
  message?: string;
}

export type { BeforeSubmitContext, BeforeSubmitHandler } from './beforeSubmit';

export type * from '../grid/types';
