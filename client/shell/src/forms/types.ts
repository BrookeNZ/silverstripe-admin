/**
 * The FormSchema payload as LeftAndMain and FormSchema send it today (schema, state and errors parts),
 * plus the props contract between the shell's form renderer and a field component.
 */
import type { ReactNode } from 'react';

export interface SchemaMessage {
  value: string;
  type: string;
  field?: string;
}

export interface SourceOption {
  value: string | number;
  title: string;
  disabled?: boolean;
}

export type SchemaData = Record<string, unknown>;

export interface FieldSchema {
  name: string;
  id: string;
  type: string | null;
  schemaType: string | null;
  component: string | null;
  holderId?: string;
  title: string | number | boolean | null;
  description?: string | null;
  rightTitle?: string | null;
  extraClass?: string;
  readOnly: boolean;
  disabled: boolean;
  attributes?: SchemaData;
  source?: Array<SourceOption> | null;
  // PHP serialises an empty data map as []
  data: SchemaData | [];
  children?: Array<FieldSchema>;
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

export interface FormSchemaResponse {
  id: string;
  schema?: FormSchemaTree;
  state?: FormSchemaState;
  errors?: Array<SchemaMessage>;
}

/** A schema field merged with its state, keyed for the form library */
export interface FormField extends Omit<FieldSchema, 'children' | 'data' | 'source'> {
  key: string;
  value: unknown;
  message: SchemaMessage | null;
  data: SchemaData;
  source: Array<SourceOption>;
  children: Array<FormField>;
}

export interface FieldComponentProps<V = unknown> {
  field: FormField;
  value: V;
  onChange(value: V): void;
  onBlur(): void;
  error?: string;
  submitting: boolean;
  renderFields(fields: Array<FormField>): ReactNode;
}
