/**
 * Field component resolution, as a pure function so the order can be tested without a shell.
 *
 * Order: the field's explicit candidates (`componentCandidates`, else its `component`) in order; then,
 * only when the field names no component, the default for its `schemaType`; then nothing, which the
 * renderer shows as a visible missing-field notice. A named but unregistered component never falls to
 * the type default: that would render a tree picker as an empty dropdown, and the legacy FormBuilder
 * never substitutes one either.
 */
import type { FieldSchema } from './types';

// Mirrors FormBuilder's getComponentForDataType in the legacy admin bundle
export const schemaTypeComponents: Readonly<Record<string, string>> = {
  Integer: 'NumberField',
  Decimal: 'NumberField',
  String: 'TextField',
  Text: 'TextField',
  Date: 'DateField',
  Time: 'TimeField',
  Datetime: 'DatetimeField',
  Hidden: 'HiddenField',
  SingleSelect: 'SingleSelectField',
  Custom: 'GridField',
  Structural: 'CompositeField',
  Boolean: 'CheckboxField',
  MultiSelect: 'CheckboxSetField',
};

export type ResolvableField = Pick<FieldSchema, 'component' | 'componentCandidates' | 'schemaType'>;

export type FieldResolution = { name: string } | { name: null; tried: Array<string> };

export function explicitCandidates(field: ResolvableField): Array<string> {
  const candidates = field.componentCandidates ?? [];
  if (field.component && !candidates.includes(field.component)) {
    return [field.component, ...candidates];
  }
  return [...candidates];
}

export function resolveFieldComponent(field: ResolvableField, isRegistered: (name: string) => boolean): FieldResolution {
  const tried = explicitCandidates(field);
  const typeDefault = !field.component && field.schemaType ? schemaTypeComponents[field.schemaType] : undefined;
  if (typeDefault) {
    tried.push(typeDefault);
  }
  const name = tried.find(isRegistered);
  return name ? { name } : { name: null, tried };
}
