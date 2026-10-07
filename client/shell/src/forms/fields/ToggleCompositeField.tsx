/**
 * The framework's ToggleCompositeField as a Disclosure. Its schema names the plain CompositeField
 * component, so the shell registers this under the PHP class name, the first of the field's
 * `componentCandidates`. The schema carries no `startClosed` or `headingLevel`: the open state is read
 * from the `ss-toggle-start-closed` class its getAttributes() adds, and the heading level is
 * `data.headingLevel` when a server sends one, else the PHP default of 3.
 */
import * as React from 'react';
import { Disclosure, fieldTitle } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

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
    id={field.id}
    title={fieldTitle(field)}
    headingLevel={field.headingLevel ?? 3}
    defaultOpen={!startsClosed(field)}
  >
    {renderFields(field.children)}
  </Disclosure>
);
