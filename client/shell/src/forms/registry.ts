/**
 * Field component resolution. A field names its component, or leaves it null and is resolved by its
 * schemaType; whatever cannot be resolved renders UnknownField so the form still renders around it.
 * Every lookup goes through the Pilet API's component slots, so a pilet can register or override any
 * name, and a field re-resolves when a pilet registers late.
 */
import type { ComponentType } from 'react';
import { useGlobalState } from 'piral-core';
import { componentSlotName, silverstripeComponent } from '../api/silverstripe';
import { UnknownField } from './fields/UnknownField';
import type { FieldComponentProps, FormField } from './types';

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

export interface ResolvedFieldComponent {
  name: string | null;
  Component: ComponentType<FieldComponentProps<any>>;
}

/**
 * A named component that nothing registered falls straight to UnknownField: a schemaType default would
 * render a tree picker as an empty dropdown, and the legacy FormBuilder never substitutes one either
 */
export function candidateComponentNames(field: Pick<FormField, 'component' | 'schemaType'>): Array<string> {
  if (field.component) {
    return [field.component];
  }
  const byType = field.schemaType ? schemaTypeComponents[field.schemaType] : undefined;
  return byType ? [byType] : [];
}

export function useFormFieldComponent(field: FormField): ResolvedFieldComponent {
  const extensions = useGlobalState((state) => state.registry.extensions);
  const name = candidateComponentNames(field).find((candidate) => extensions[componentSlotName(candidate)]?.length);
  return name ? { name, Component: silverstripeComponent(name) } : { name: null, Component: UnknownField };
}
