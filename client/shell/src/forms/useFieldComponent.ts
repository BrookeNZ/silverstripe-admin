import type { ComponentType } from 'react';
import { useGlobalState } from 'piral-core';
import type { GlobalState } from 'piral-core';
import { componentSlotName, silverstripeComponent } from '../api/silverstripe';
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
