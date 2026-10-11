/**
 * The framework's ToggleCompositeField as a Disclosure. Its schema names the plain CompositeField
 * component, so the shell registers this under the PHP class name, the first of the field's
 * `componentCandidates`. The admin module sends `data.startClosed` and `data.headingLevel`; a schema
 * without them (a server lacking the admin decoration) falls back to the `ss-toggle-start-closed` class
 * its getAttributes() adds, and to the PHP default heading level of 3.
 */
import { Disclosure, fieldTitle } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';
import './toggle-composite-field.css';

export const toggleCompositeFieldClass = 'SilverStripe\\Forms\\ToggleCompositeField';

export function startsClosed(field: FieldComponentProps['field']): boolean {
  if (typeof field.data.startClosed === 'boolean') {
    return field.data.startClosed;
  }
  const classes = String(field.attributes?.class ?? '').split(/\s+/);
  return classes.includes('ss-toggle-start-closed');
}

export const ToggleCompositeField = ({ field, renderFields }: FieldComponentProps) => (
  <Disclosure
    className="shell-toggle-composite-field"
    id={field.id}
    title={fieldTitle(field)}
    headingLevel={field.headingLevel ?? 3}
    defaultOpen={!startsClosed(field)}
  >
    {renderFields(field.children)}
  </Disclosure>
);
