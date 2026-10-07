import type { ComponentType } from 'react';
import { useGlobalState } from 'piral-core';
import type { GlobalState } from 'piral-core';
import { componentSlotName, isFullWidth, silverstripeComponent } from '../api/silverstripe';
import { UnknownField } from './fields/UnknownField';
import { resolveFieldComponent } from './resolve';
import type { FieldResolution, ResolvableField } from './resolve';
import type { FieldComponentProps, FormField } from './types';

export function resolveInRegistry(field: ResolvableField, extensions: GlobalState['registry']['extensions']): FieldResolution {
  return resolveFieldComponent(field, (candidate) => Boolean(extensions[componentSlotName(candidate)]?.length));
}

/** Resolves against the Pilet API's component slots, so a late or unloaded pilet re-resolves the field */
export function useFieldComponent(field: FormField): ComponentType<FieldComponentProps<any>> {
  const extensions = useGlobalState((state) => state.registry.extensions);
  const { name } = resolveInRegistry(field, extensions);
  return name ? silverstripeComponent(name) : UnknownField;
}

/** Whether the latest registration of the field's component declares `fullWidth` */
export function isFullWidthInRegistry(field: ResolvableField, extensions: GlobalState['registry']['extensions']): boolean {
  const { name } = resolveInRegistry(field, extensions);
  const registrations = name ? extensions[componentSlotName(name)] : undefined;
  return isFullWidth(registrations?.[registrations.length - 1]?.reference);
}

export function useFullWidthField(field: FormField): boolean {
  const extensions = useGlobalState((state) => state.registry.extensions);
  return isFullWidthInRegistry(field, extensions);
}
