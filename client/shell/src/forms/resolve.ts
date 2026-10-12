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
 *
 * A field that resolves to one of its ancestors' components (a URL segment field drawn as a plain
 * TextField) still renders, but counts as a downgrade, which the shell reports once per field class.
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

export interface FieldDowngrade {
  /** The field's class */
  component: string;
  /** The ancestor's component it rendered as */
  resolved: string;
}

const shortName = (name: string) => name.slice(name.lastIndexOf('\\') + 1);

/**
 * Whether `resolved` is an ancestor's component rather than the field's own. Own means the declared
 * component, the field's class, or a type default named after that class (TextField for TextField); a
 * type default no ancestor is named after (NumberField for NumericField) is not a downgrade either
 */
export function fieldDowngrade(field: ResolvableField, resolved: string): FieldDowngrade | null {
  const [ownClass, ...ancestry] = field.componentCandidates ?? [];
  if (!ownClass || resolved === serverHtmlComponent || resolved === field.component) {
    return null;
  }
  if (resolved === ownClass || resolved === shortName(ownClass)) {
    return null;
  }
  const fromAncestor = ancestry.some((name) => name === resolved || shortName(name) === resolved);
  return fromAncestor ? { component: ownClass, resolved } : null;
}
