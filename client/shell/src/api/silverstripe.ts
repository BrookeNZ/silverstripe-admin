/**
 * The Silverstripe Pilet API: the verbs a module's pilet uses to plug into the CMS shell, as sketched
 * in RFC silverstripe/.github#346. Components are stored as Piral extensions, so they get Piral's error
 * boundary, converters, lifecycle (removed with their pilet) and a disposer for free. Notifications come
 * from piral-notifications, which already provides `showNotification`.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import type { Disposable, PiralPlugin } from 'piral-core';
import { ExtensionSlot } from 'piral-core';
import type { SilverstripeClientConfig } from '../silverstripe';
import { clearSectionHeaderOf, setSectionHeader } from '../header/state';
import type { SectionHeader } from '../header/state';
import { clearUnsavedChangesOf, hasUnsavedChanges, setUnsavedChanges } from '../unsaved';
import { clearBeforeSubmitOf, registerBeforeSubmit } from '../forms/beforeSubmit';
import type { BeforeSubmitHandler } from '../forms/beforeSubmit';
import { sectionIconSlotName } from '../menu/sectionIcons';
import { menuItemReference, menuItemSlot } from '../menu/menuItems';
import type { MenuItemRegistration } from '../menu/menuItems';

export type { MenuItemRegistration };

/**
 * A field component with `fullWidth` set renders edge to edge in a form, without the inset every other
 * top-level field gets
 */
export type SilverstripeComponent<P = any> = ComponentType<P> & { fullWidth?: boolean };

export function isFullWidth(component: unknown): boolean {
  return (component as { fullWidth?: unknown } | null)?.fullWidth === true;
}

export interface SilverstripeApi {
  registerSilverstripeComponent(name: string, Component: SilverstripeComponent): Disposable;
  getSilverstripeComponent(name: string): ComponentType<any>;
  /**
   * Fills the slot `<name>.<slot>`. For `SilverStripe\Admin\LeftAndMain` / `menu.bottom` this is the legacy
   * way to add a menu link, with the pilet's own markup; prefer `registerMenuItem`
   */
  registerExtensionComponent(name: string, slot: string, Component: ComponentType<any>): Disposable;
  getConfig(): Readonly<SilverstripeClientConfig>;
  /**
   * Reports whether something this pilet owns (a form, an editor) has unsaved changes, which makes the
   * shell confirm before navigating away. Keys are scoped to the pilet; the disposer clears the key
   */
  setUnsavedChanges(key: string, dirty: boolean): Disposable;
  hasUnsavedChanges(): boolean;
  /**
   * Shows the section header (back button, title as the page h1, views) above the content until the
   * disposer runs; call it from the page and dispose on unmount. A later call replaces the header
   */
  setSectionHeader(header: SectionHeader): Disposable;
  /**
   * Runs `handler` before the form with this element id posts, and cancels the post when it resolves
   * false or throws; a field gets its form's id as the `formId` prop
   */
  registerBeforeSubmit(formId: string, handler: BeforeSubmitHandler): Disposable;
  /**
   * Draws `Icon` beside the section's menu item in place of the icon its legacy `menu_icon_class`
   * picks. `sectionCode` is the menu item's code: the controller class with hyphens for backslashes
   */
  registerSectionIcon(sectionCode: string, Icon: ComponentType): Disposable;
  /**
   * Adds a link after the CMS sections that the shell draws like a section's, for a page with no server
   * section behind it. A section the server knows already has its menu item
   */
  registerMenuItem(item: MenuItemRegistration): Disposable;
}

declare module 'piral-core/lib/types/custom' {
  interface PiletCustomApi extends SilverstripeApi {}
}

const componentPrefix = 'silverstripe:component:';

export function extensionSlotName(name: string, slot: string): string {
  return `${name}.${slot}`;
}

export function componentSlotName(name: string): string {
  return componentPrefix + name;
}

const resolvedComponents = new Map<string, ComponentType<any>>();

/**
 * The stand-in for a named component: it renders the latest registration of that name, passing its
 * props through, or nothing. Cached so a name always yields the same component and never remounts
 */
export function silverstripeComponent(name: string): ComponentType<any> {
  let Resolved = resolvedComponents.get(name);
  if (!Resolved) {
    Resolved = (props: Record<string, unknown>) =>
      React.createElement(ExtensionSlot, {
        name: componentSlotName(name),
        params: props,
        render: (children: React.ReactNode[]) => React.createElement(React.Fragment, null, children[children.length - 1] ?? null),
      });
    Resolved.displayName = `SilverstripeComponent(${name})`;
    resolvedComponents.set(name, Resolved);
  }
  return Resolved;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

let frozenConfig: Readonly<SilverstripeClientConfig> | undefined;

export function createSilverstripeApi(): PiralPlugin<SilverstripeApi> {
  return (context) => {
    context.on('unload-pilet', ({ name }) => {
      clearUnsavedChangesOf(context, name);
      clearSectionHeaderOf(context, name);
      clearBeforeSubmitOf(name);
    });

    return (api, meta) => ({
      registerSilverstripeComponent(name, Component) {
        const slot = componentSlotName(name);
        const existing = context.readState((state) => state.registry.extensions[slot] ?? []);
        if (existing.length > 0) {
          console.info(`Silverstripe component "${name}" is overridden; the latest registration is used`);
        }
        const Registered = ({ params }: { params: Record<string, unknown> }) => React.createElement(Component, params);
        return api.registerExtension(slot, Object.assign(Registered, { fullWidth: isFullWidth(Component) }));
      },
      getSilverstripeComponent(name) {
        const Resolved = silverstripeComponent(name);
        if (!Object.prototype.hasOwnProperty.call(Resolved, 'fullWidth')) {
          // Read at access time, so a decorator copying the flag gets the current registration's answer
          Object.defineProperty(Resolved, 'fullWidth', {
            get: () => {
              const registrations = context.readState((state) => state.registry.extensions[componentSlotName(name)] ?? []);
              return isFullWidth(registrations[registrations.length - 1]?.reference);
            },
          });
        }
        return Resolved;
      },
      registerExtensionComponent(name, slot, Component) {
        return api.registerExtension(extensionSlotName(name, slot), Component);
      },
      getConfig() {
        frozenConfig ??= deepFreeze(structuredClone(window.ss.config));
        return frozenConfig;
      },
      setUnsavedChanges(key, dirty) {
        return setUnsavedChanges(context, meta.name, key, dirty);
      },
      hasUnsavedChanges() {
        return hasUnsavedChanges(context);
      },
      setSectionHeader(header) {
        return setSectionHeader(context, meta.name, header);
      },
      registerBeforeSubmit(formId, handler) {
        return registerBeforeSubmit(formId, meta.name, handler);
      },
      registerSectionIcon(sectionCode, Icon) {
        return api.registerExtension(sectionIconSlotName(sectionCode), () => React.createElement(Icon));
      },
      registerMenuItem(item) {
        return api.registerExtension(menuItemSlot, menuItemReference(item));
      },
    });
  };
}
