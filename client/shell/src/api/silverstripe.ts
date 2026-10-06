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
import { clearUnsavedChangesOf, hasUnsavedChanges, setUnsavedChanges } from '../unsaved';

export interface SilverstripeApi {
  registerSilverstripeComponent(name: string, Component: ComponentType<any>): Disposable;
  getSilverstripeComponent(name: string): ComponentType<any>;
  registerExtensionComponent(name: string, slot: string, Component: ComponentType<any>): Disposable;
  getConfig(): Readonly<SilverstripeClientConfig>;
  /**
   * Reports whether something this pilet owns (a form, an editor) has unsaved changes, which makes the
   * shell confirm before navigating away. Keys are scoped to the pilet; the disposer clears the key
   */
  setUnsavedChanges(key: string, dirty: boolean): Disposable;
  hasUnsavedChanges(): boolean;
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
    context.on('unload-pilet', ({ name }) => clearUnsavedChangesOf(context, name));

    return (api, meta) => ({
      registerSilverstripeComponent(name, Component) {
        const slot = componentSlotName(name);
        const existing = context.readState((state) => state.registry.extensions[slot] ?? []);
        if (existing.length > 0) {
          console.info(`Silverstripe component "${name}" is overridden; the latest registration is used`);
        }
        return api.registerExtension(slot, ({ params }: { params: Record<string, unknown> }) =>
          React.createElement(Component, params),
        );
      },
      getSilverstripeComponent(name) {
        return silverstripeComponent(name);
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
    });
  };
}
