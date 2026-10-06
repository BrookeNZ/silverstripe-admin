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

export interface SilverstripeApi {
  registerSilverstripeComponent(name: string, Component: ComponentType<any>): Disposable;
  getSilverstripeComponent(name: string): ComponentType<any>;
  registerExtensionComponent(name: string, slot: string, Component: ComponentType<any>): Disposable;
  getConfig(): Readonly<SilverstripeClientConfig>;
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
  return (context) => (api) => ({
    registerSilverstripeComponent(name, Component) {
      const slot = componentSlotName(name);
      const existing = context.readState((state) => state.registry.extensions[slot] ?? []);
      if (existing.length > 0) {
        console.warn(`Silverstripe component "${name}" is already registered; the first registration is used`);
      }
      return api.registerExtension(slot, Component);
    },
    getSilverstripeComponent(name) {
      const Resolved: React.FC<Record<string, unknown>> = (props) =>
        React.createElement(ExtensionSlot, {
          name: componentSlotName(name),
          params: props,
          render: (children: React.ReactNode[]) => React.createElement(React.Fragment, null, children[0] ?? null),
        });
      Resolved.displayName = `SilverstripeComponent(${name})`;
      return Resolved;
    },
    registerExtensionComponent(name, slot, Component) {
      return api.registerExtension(extensionSlotName(name, slot), Component);
    },
    getConfig() {
      frozenConfig ??= deepFreeze(structuredClone(window.ss.config));
      return frozenConfig;
    },
  });
}
