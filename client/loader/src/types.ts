/**
 * What a client entry imports from `@silverstripe/admin`: the types below and `clientConfig()`, provided at runtime.
 * `setup()` receives the frozen `admin` object; the client config comes from `clientConfig()`.
 * AdminApi and ClientEntry are interfaces, not aliases, so later code can augment them.
 */
export { clientConfig } from './runtime';

/**
 * A client entry's item in the page's entry list (`#ss-admin-entries`); every listed entry loads with the page.
 * An entry is a JavaScript file with a `setup` export, not a component: its setup may register several components or none
 */
export interface ClientEntry {
  /** The entry's import map specifier, `<module>/<entry>`, which the loader imports it by */
  name: string;
  /** The Composer package the entry belongs to */
  module: string;
}

/** What `setup` receives: read-only, and still valid after an `await` */
export interface AdminApi {
  readonly entry: Readonly<ClientEntry>;
  /** The Composer name of the entry's package, as `entry.module` gives it */
  readonly package: string;
}

/**
 * What a client entry exports as `setup`. The admin object it receives is the entry's handle for the admin's
 * registration APIs, which are still to come, and `setup` may receive further arguments after it. The loader waits for
 * a returned promise before the next entry's setup runs
 */
export type EntrySetup = (admin: Readonly<AdminApi>) => void | Promise<void>;

export interface Section {
  name: string;
  url: string;
  reactRoutePath?: string;
  form?: Record<string, { schemaUrl: string }>;
  [key: string]: unknown;
}

/**
 * The client config LeftAndMain::getCombinedClientConfig() builds for `#ss-admin-config`; keep both interfaces' fields
 * in step. The CSRF token sits under its configurable name, so it is not typed here
 */
export interface ClientConfig {
  sections: Array<Section>;
  baseUrl: string;
  absoluteBaseUrl: string;
  adminUrl: string;
  environment: string;
  debugging: boolean;
  [key: string]: unknown;
}
