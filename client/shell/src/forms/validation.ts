/**
 * The shell's own client validation, registered as the first `updateFormValidation` handler
 * (`shell:validation`) so a pilet can add to or drop its messages. It checks `required` only, from each
 * schema field's `validation`, as the legacy `schema-validation` transform did; the other legacy rules
 * (numeric, email, max and so on) are left to the server, which validates every post anyway.
 */
import { registerHook, shellHookOwner } from '../hooks/registry';
import type { FormValidationErrors, HookContext } from '../hooks/types';
import { fieldKey } from './schema';
import type { FieldSchema } from './types';

function isEmpty(value: unknown, extraEmptyValues: ReadonlyArray<unknown>): boolean {
  if (value === undefined || value === null || value === false || value === '') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return extraEmptyValues.includes(value);
}

function requiredRule(field: FieldSchema): { extraEmptyValues: ReadonlyArray<unknown>; message?: string } | null {
  // PHP serialises an empty rule map as []
  const required = Array.isArray(field.validation) ? undefined : field.validation?.required;
  if (!required) {
    return null;
  }
  const config = typeof required === 'object' ? (required as { extraEmptyValues?: unknown; message?: unknown }) : {};
  return {
    extraEmptyValues: Array.isArray(config.extraEmptyValues) ? config.extraEmptyValues : [],
    message: typeof config.message === 'string' ? config.message : undefined,
  };
}

function fieldLabel(field: FieldSchema): string {
  const label = field.leftTitle ?? field.title;
  return typeof label === 'string' && label !== '' ? label : field.name;
}

export function validateRequired(
  errors: FormValidationErrors,
  { values, schema }: HookContext<'updateFormValidation'>,
): FormValidationErrors {
  const found: Record<string, ReadonlyArray<string>> = {};
  const visit = (fields: ReadonlyArray<FieldSchema>) => {
    for (const field of fields) {
      const rule = requiredRule(field);
      const key = fieldKey(field.name);
      if (rule && key in values && isEmpty(values[key], rule.extraEmptyValues)) {
        const message = field.customValidationMessage || rule.message || '{name} is required.';
        found[field.name] = [message.replace('{name}', fieldLabel(field))];
      }
      visit(field.children ?? []);
    }
  };
  visit(schema.fields);
  return Object.keys(found).length > 0 ? { ...errors, ...found } : errors;
}

export function registerShellValidation(): () => void {
  return registerHook(shellHookOwner, 'updateFormValidation', validateRequired, { id: 'validation' });
}
