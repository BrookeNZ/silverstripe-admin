/**
 * Menu items a pilet registers with `registerMenuItem`: plain descriptions the menu draws with the same link
 * as a CMS section, for a pilet-only page that has no server section behind it. Each registration is a
 * Piral extension in one slot, so unloading the pilet removes it; the item rides on the registered
 * component because Piral's disposer finds a registration by its component.
 */
import type { ComponentType } from 'react';
import { useGlobalState } from 'piral-core';
import type { GlobalState } from 'piral-core';
import type { IconProps } from '@silverstripe/admin-patterns';

export const menuItemSlot = 'silverstripe:menu-item';

export interface MenuItemRegistration {
  /** Identifies the item; a later registration with the same code replaces it */
  code: string;
  label: string;
  /** A router path relative to the admin base, as for `registerPage` */
  to: string;
  /** An 18px `currentColor` glyph; the generic section icon when not given */
  Icon?: ComponentType<IconProps>;
}

export type MenuItemReference = (() => null) & { menuItem: Readonly<MenuItemRegistration> };

export function menuItemReference(item: MenuItemRegistration): MenuItemReference {
  return Object.assign(() => null, { menuItem: Object.freeze({ ...item }) });
}

/** In registration order, the latest registration of a code in the place of the first */
export function menuItemsInRegistry(extensions: GlobalState['registry']['extensions']): Array<Readonly<MenuItemRegistration>> {
  const items = new Map<string, Readonly<MenuItemRegistration>>();
  for (const registration of extensions[menuItemSlot] ?? []) {
    const item = (registration.reference as Partial<MenuItemReference> | undefined)?.menuItem;
    if (item) {
      items.set(item.code, item);
    }
  }
  return [...items.values()];
}

export function usePiletMenuItems(): Array<Readonly<MenuItemRegistration>> {
  const extensions = useGlobalState((state) => state.registry.extensions);
  return menuItemsInRegistry(extensions);
}
