/**
 * Field component resolution, as a pure function so the order can be tested without a shell.
 *
 * A field that names a component tries its explicit candidates (`componentCandidates`, else its
 * `component`) in order and nothing else: a named but unregistered component never falls to the type
 * default, which would render a tree picker as an empty dropdown (the legacy FormBuilder never
 * substitutes one either). A field that names no component tries its own class, then the default for
 * its `schemaType`, then its parent classes, so a parent class registration never outranks the type
 * default. Either way, when the admin sent the field's server HTML, the transitional ServerHtmlField
 * comes last; after that the renderer shows a visible missing-field notice.
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

export type ResolvableField = Pick<FieldSchema, 'component' | 'componentCandidates' | 'schemaType' | 'fallback'>;

export const serverHtmlComponent = 'ServerHtmlField';

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
    tried.splice(Math.min(tried.length, 1), 0, typeDefault);
  }
  if (field.fallback?.html) {
    tried.push(serverHtmlComponent);
  }
  const name = tried.find(isRegistered);
  return name ? { name } : { name: null, tried };
}
