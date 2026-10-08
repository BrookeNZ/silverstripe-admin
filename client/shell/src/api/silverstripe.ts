/**
 * The Silverstripe Pilet API: the verbs a module's pilet uses to plug into the CMS shell, as sketched
 * in RFC silverstripe/.github#346. Components are stored as Piral extensions, so they get Piral's error
 * boundary, converters, lifecycle (removed with their pilet) and a disposer for free. Notifications come
 * from piral-notifications, which already provides `showNotification`.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import type { AnyExtensionComponent, Disposable, PiralPlugin } from 'piral-core';
import { ExtensionSlot } from 'piral-core';
import type { SilverstripeClientConfig } from '../silverstripe';
import { clearSectionHeaderOf, setSectionHeader } from '../header/state';
import type { SectionHeader } from '../header/state';
import { clearUnsavedChangesOf, hasUnsavedChanges, setUnsavedChanges } from '../unsaved';
import { clearHooksOf, hookKind, registerHook, runAfterHook, runBeforeHook, runUpdateHook, setHookFeedOrder, shellHookOwner } from '../hooks/registry';
import type { HookKind } from '../hooks/registry';
import type { AfterHookName, BeforeHookName, HookContext, HookHandler, HookOptions, HookPoints, HookValue, UpdateHookName } from '../hooks/types';
import { sectionIconSlotName } from '../menu/sectionIcons';
import { sectionSidebarSlotName } from '../header/SectionSidebar';
import type { SectionSidebarSlotProps } from '../header/SectionSidebar';
import { menuItemReference, menuItemSlot } from '../menu/menuItems';
import type { MenuItemRegistration } from '../menu/menuItems';
import { chosenPreviewMode, subscribePreviewMode } from '../preview/mode';
import { recordsChangedEvent } from '../events';
import { routerPath } from '../routing';
import type { RecordsChangedEvent, RecordsChangedEventName } from '../events';
import {
  clearCurrentRecordOf,
  createUseSharedState,
  setCurrentRecord,
  setViewMode,
  sharedConfig,
  subscribeSharedState,
} from '../state/sharedState';
import type { CurrentRecord, SharedState, SharedStateListener, SharedStateSelector, SharedToast } from '../state/sharedState';

import type {
  ServerMutation,
  ServerMutationOptions,
  ServerMutationResult,
  ServerQueryContext,
  ServerQueryFetcher,
  ServerQueryKey,
  ServerQueryKeyPart,
  ServerQueryOptions,
  ServerQueryResult,
} from '../state/serverCache';
import type { ServerRequest, ServerRequestInit, ServerRequestMethod } from '../state/serverRequest';
import type { ServerRequestError, ServerRequestErrorShape } from '../state/errorTypes';
import type { FieldComponentProps, SchemaFormDialogProps } from '../forms/types';
import type { FormSchemaFormProps } from '../forms/FormSchemaForm';
import type { AddNewButtonProps } from '../grid/AddNewButton';
import type { GridCellProps } from '../grid/types';

export type { AfterHookName, BeforeHookName, HookContext, HookHandler, HookOptions, HookPoints, HookValue, UpdateHookName };
export type { CurrentRecord, MenuItemRegistration, RecordsChangedEvent, RecordsChangedEventName, SharedState, SharedStateListener, SharedStateSelector, SharedToast };
export type {
  ServerMutation,
  ServerMutationOptions,
  ServerMutationResult,
  ServerQueryContext,
  ServerQueryFetcher,
  ServerQueryKey,
  ServerQueryKeyPart,
  ServerQueryOptions,
  ServerQueryResult,
  ServerRequest,
  ServerRequestError,
  ServerRequestErrorShape,
  ServerRequestInit,
  ServerRequestMethod,
};

/**
 * A field component with `fullWidth` set renders edge to edge in a form, without the inset every other
 * top-level field gets
 */
export type SilverstripeComponent<P = object> = ComponentType<P> & { fullWidth?: boolean };

/**
 * The props of each component registered by name. A pilet whose component other pilets read names its
 * props by augmenting this interface, as `HookPoints` is augmented; a name not listed takes any props
 */
export interface SilverstripeComponents {
  FormSchemaForm: FormSchemaFormProps;
  SchemaFormDialog: SchemaFormDialogProps;
  TextField: FieldComponentProps;
  NumberField: FieldComponentProps;
  HiddenField: FieldComponentProps;
  CheckboxField: FieldComponentProps;
  SingleSelectField: FieldComponentProps;
  OptionsetField: FieldComponentProps;
  DateField: FieldComponentProps;
  DatetimeField: FieldComponentProps;
  ListboxField: FieldComponentProps;
  ReadonlyField: FieldComponentProps;
  LookupField: FieldComponentProps;
  HtmlReadonlyField: FieldComponentProps;
  LiteralField: FieldComponentProps;
  HeaderField: FieldComponentProps;
  LabelField: FieldComponentProps;
  CompositeField: FieldComponentProps;
  FieldGroup: FieldComponentProps;
  ProportionConstraintField: FieldComponentProps;
  'SilverStripe\\Forms\\ToggleCompositeField': FieldComponentProps;
  Tabs: FieldComponentProps;
  TabItem: FieldComponentProps;
  FormAction: FieldComponentProps;
  PopoverField: FieldComponentProps;
  MenuField: FieldComponentProps;
  UnsavedChangesIndicator: FieldComponentProps;
  SudoModePasswordField: FieldComponentProps;
  ServerHtmlField: FieldComponentProps;
  'SilverStripe\\Forms\\GridField\\GridField': FieldComponentProps;
  'GridField.cell.Text': GridCellProps;
  'GridField.AddNewButton': AddNewButtonProps;
}

/** The props `SilverstripeComponents` lists for `K`, else `Unlisted` */
export type SilverstripeComponentProps<K extends string, Unlisted = Record<string, unknown>> = K extends keyof SilverstripeComponents
  ? SilverstripeComponents[K]
  : Unlisted;

export function isFullWidth(component: unknown): boolean {
  return (component as { fullWidth?: unknown } | null)?.fullWidth === true;
}

export interface SilverstripeApi {
  /** A listed name must be given a component taking its listed props; any other name takes any component */
  registerSilverstripeComponent: <K extends string, P extends object>(
    name: K,
    Component: SilverstripeComponent<SilverstripeComponentProps<K, P>>,
  ) => Disposable;
  getSilverstripeComponent: <K extends string>(name: K) => SilverstripeComponent<SilverstripeComponentProps<K>>;
  /**
   * Fills the slot `<name>.<slot>`. For `SilverStripe\Admin\LeftAndMain` / `menu.bottom` this is the legacy
   * way to add a menu link, with the pilet's own markup; prefer `registerMenuItem`
   */
  registerExtensionComponent: (name: string, slot: string, Component: AnyExtensionComponent<string>) => Disposable;
  /** A deep-frozen copy of `window.ss.config` taken at first use; `fetchJson` reads the CSRF token live instead */
  getConfig: () => Readonly<SilverstripeClientConfig>;
  /**
   * Reports whether something this pilet owns (a form, an editor) has unsaved changes, which makes the
   * shell confirm before navigating away. Keys are scoped to the pilet; the disposer clears the key
   */
  setUnsavedChanges: (key: string, dirty: boolean) => Disposable;
  hasUnsavedChanges: () => boolean;
  /**
   * Shows the section header (back button, title as the page h1, views) above the content until the
   * disposer runs; call it from the page and dispose on unmount. A later call replaces the header
   */
  setSectionHeader: (header: SectionHeader) => Disposable;
  /**
   * Adds a handler to a hook point. The name decides the kind: `updateX(value, context)` returns the
   * value, `onBeforeX(context)` may resolve false to cancel, `onAfterX(context)` is told. The handler is
   * known to other registrations' `before` and `after` as `<pilet>:<options.id>`
   */
  registerHook: <N extends string>(name: N, handler: HookHandler<N>, options?: HookOptions) => Disposable;
  /**
   * Runs a hook point the pilet owns: every handler, the shell's first, then pilets in feed order, each
   * returning the value the next one gets. A pilet declares the value and context by augmenting `HookPoints`
   */
  runUpdateHook: <N extends UpdateHookName>(name: N, value: HookValue<N>, context: HookContext<N>) => HookValue<N>;
  /** Resolves false as soon as a handler cancels; a handler that throws rejects with its error */
  runBeforeHook: <N extends BeforeHookName>(name: N, context: HookContext<N>) => Promise<boolean>;
  /** Tells every handler; their errors are logged, not thrown, and async handlers are not awaited */
  runAfterHook: <N extends AfterHookName>(name: N, context: HookContext<N>) => void;
  /**
   * Draws `Icon` beside the section's menu item in place of the icon its legacy `menu_icon_class`
   * picks. `sectionCode` is the menu item's code: the controller class with hyphens for backslashes
   */
  registerSectionIcon: (sectionCode: string, Icon: ComponentType) => Disposable;
  /**
   * Fills the sidebar column the layout draws while the showing page's header has a `sidebar` naming
   * `sectionCode`. The latest registration is drawn
   */
  registerSectionSidebar: (sectionCode: string, Sidebar: ComponentType<SectionSidebarSlotProps>) => Disposable;
  /**
   * Adds a link after the CMS sections that the shell draws like a section's, for a page with no server
   * section behind it. A section the server knows already has its menu item
   */
  registerMenuItem: (item: MenuItemRegistration) => Disposable;
  /**
   * Reads shared state in a component and re-renders when the selected value changes (Object.is). The
   * selector may be inline; one that builds a new object re-renders on every shared state change
   */
  useSharedState: <T>(selector: SharedStateSelector<T>) => T;
  /**
   * Calls `listener(value, previous)` each time the selected value changes, not at once. Unloading the
   * pilet unsubscribes it
   */
  subscribeSharedState: <T>(selector: SharedStateSelector<T>, listener: SharedStateListener<T>) => Disposable;
  /**
   * Names the record the showing page edits, as shared state's `currentRecord`, until the disposer runs;
   * call it from the page and dispose on unmount. A later call wins until it is disposed
   */
  setCurrentRecord: (record: CurrentRecord) => Disposable;
  /** The records-changed event's name, for `emit`, `on` and `off`; its value is a `RecordsChangedEvent` */
  readonly recordsChangedEvent: RecordsChangedEventName;
  /**
   * The shell router's path for a server link under the admin URL (`admin/pages/edit/show/7` becomes
   * `/pages/edit/show/7`), keeping its query and hash; the bare admin URL gives `/`. Null for another
   * origin or a link outside the admin, which needs a page load
   */
  routerPath: (url: string) => string | null;
}

declare module 'piral-core/lib/types/custom' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merging into Piral's pilet API needs an interface
  interface PiletCustomApi extends SilverstripeApi {}
}

const componentPrefix = 'silverstripe:component:';

export function extensionSlotName(name: string, slot: string): string {
  return `${name}.${slot}`;
}

export function componentSlotName(name: string): string {
  return componentPrefix + name;
}

function requireKind<N extends string>(name: N, kind: HookKind): N {
  if (hookKind(name) !== kind) {
    throw new Error(`Hook "${name}" is not an ${kind}X name`);
  }
  return name;
}

type StandIn = ((props: object) => React.ReactElement) & { displayName?: string };

const resolvedComponents = new Map<string, StandIn>();

/**
 * The stand-in for a named component: it renders the latest registration of that name, passing its
 * props through, or nothing. Cached so a name always yields the same component and never remounts
 */
export function silverstripeComponent<P extends object>(name: string): SilverstripeComponent<P> {
  let Resolved = resolvedComponents.get(name);
  if (!Resolved) {
    Resolved = (props: object) =>
      React.createElement(ExtensionSlot, {
        name: componentSlotName(name),
        params: props,
        render: (children: Array<React.ReactNode>) => React.createElement(React.Fragment, null, children[children.length - 1] ?? null),
      });
    Resolved.displayName = `SilverstripeComponent(${name})`;
    resolvedComponents.set(name, Resolved);
  }
  return Resolved;
}

export function createSilverstripeApi(): PiralPlugin<SilverstripeApi> {
  return (context) => {
    const subscriptions = new Map<string, Set<Disposable>>();
    const useSharedState = createUseSharedState(context);

    subscribePreviewMode(() => setViewMode(context, chosenPreviewMode()));

    let feedModules: ReadonlyArray<{ name: string }> | null = null;
    let feedNames: ReadonlyArray<string> = [];
    setHookFeedOrder(() => {
      const modules = context.readState((state) => state.modules ?? []);
      if (modules !== feedModules) {
        feedModules = modules;
        feedNames = modules.map((pilet) => pilet.name);
      }
      return feedNames;
    });

    // Piral drops an unloaded pilet's registrations itself, but not the state it set through these verbs
    context.on('unload-pilet', ({ name }) => {
      clearUnsavedChangesOf(context, name);
      clearSectionHeaderOf(context, name);
      clearCurrentRecordOf(context, name);
      clearHooksOf(name);
      subscriptions.get(name)?.forEach((unsubscribe) => unsubscribe());
      subscriptions.delete(name);
    });

    return (api, meta) => {
      if (meta.name === shellHookOwner) {
        throw new Error(`A pilet cannot be named "${shellHookOwner}": the name is the shell's own in hook order and ownership`);
      }
      return {
        registerSilverstripeComponent<K extends string, P extends object>(name: K, Component: SilverstripeComponent<SilverstripeComponentProps<K, P>>) {
          const slot = componentSlotName(name);
          const existing = context.readState((state) => state.registry.extensions[slot] ?? []);
          if (existing.length > 0) {
            console.info(`Silverstripe component "${name}" is overridden; the latest registration is used`);
          }
          const Registered = ({ params }: { params: Record<string, unknown> }) => React.createElement(Component as ComponentType<object>, params);
          return api.registerExtension(slot, Object.assign(Registered, { fullWidth: isFullWidth(Component) }));
        },
        getSilverstripeComponent<K extends string>(name: K) {
          const Resolved = silverstripeComponent<SilverstripeComponentProps<K>>(name);
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
          return sharedConfig();
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
        registerHook(name, handler, options) {
          return registerHook(meta.name, name, handler, options);
        },
        runUpdateHook(name, value, context) {
          return runUpdateHook(requireKind(name, 'update'), value, context);
        },
        runBeforeHook(name, context) {
          return runBeforeHook(requireKind(name, 'onBefore'), context);
        },
        runAfterHook(name, context) {
          runAfterHook(requireKind(name, 'onAfter'), context);
        },
        registerSectionIcon(sectionCode, Icon) {
          return api.registerExtension(sectionIconSlotName(sectionCode), () => React.createElement(Icon));
        },
        registerSectionSidebar(sectionCode, Sidebar) {
          return api.registerExtension(sectionSidebarSlotName(sectionCode), ({ params }) =>
            React.createElement(Sidebar, params as SectionSidebarSlotProps),
          );
        },
        registerMenuItem(item) {
          return api.registerExtension(menuItemSlot, menuItemReference(item));
        },
        useSharedState,
        subscribeSharedState(selector, listener) {
          const owned = subscriptions.get(meta.name) ?? new Set<Disposable>();
          subscriptions.set(meta.name, owned);
          const unsubscribe = subscribeSharedState(context, selector, listener);
          const dispose = () => {
            unsubscribe();
            owned.delete(dispose);
          };
          owned.add(dispose);
          return dispose;
        },
        setCurrentRecord(record) {
          return setCurrentRecord(context, meta.name, record);
        },
        recordsChangedEvent,
        routerPath(url) {
          return routerPath(url, sharedConfig().adminUrl);
        },
      };
    };
  };
}
