import * as React from 'react';
import type { Control } from 'react-hook-form';
import type { FormValues } from './schema';
import type { FormField, FormSchemaTree } from './types';

export interface FormRenderContextValue {
  formId: string;
  /** After `updateFormSchema` */
  schema: FormSchemaTree;
  control: Control<FormValues>;
  submitting: boolean;
  dirty: boolean;
  /** Keys of the posted fields; only these bind to the form library, so nothing else can make it dirty */
  boundKeys: ReadonlySet<string>;
  renderFields(fields: Array<FormField>): React.ReactNode;
  autofill(name: string, value: unknown): void;
}

export const FormRenderContext = React.createContext<FormRenderContextValue | null>(null);

export function useFormRenderContext(): FormRenderContextValue {
  const context = React.useContext(FormRenderContext);
  if (!context) {
    throw new Error('A form field rendered outside FormSchemaForm');
  }
  return context;
}
