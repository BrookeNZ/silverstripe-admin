/**
 * What a client entry can import from `@silverstripe/admin`: the types below, and `clientConfig()` from runtime.ts.
 * An entry's `setup()` receives the frozen `admin` object, and gets the client config by calling `clientConfig()`.
 * AdminApi and ClientEntry are interfaces rather than type aliases so later code can add fields to them.
 */
export { clientConfig } from './runtime';

/**
 * One item in the page's entry list (`#ss-admin-entries`); every listed entry loads with the page. An entry is a
 * JavaScript file with a `setup` export, not a component: its `setup` may register several components or none
 */
export interface ClientEntry {
  /** The entry's name, `<module>/<entry>`; the loader imports the entry by this name through the import map */
  name: string;
  /** The Composer package the entry belongs to */
  module: string;
}

/** The object `setup` receives: read-only, and still usable after an `await` */
export interface AdminApi {
  readonly entry: Readonly<ClientEntry>;
}

/**
 * The `setup` function a client entry exports. Its `admin` argument is where the admin's registration APIs will go
 * once they exist, and more arguments may follow it later. When `setup` returns a promise, the loader waits for it
 * before running the next entry's `setup`
 */
export type EntrySetup = (admin: Readonly<AdminApi>) => void | Promise<void>;

/** One admin section in the client config; `form` is set only for a section with forms, and extra fields are untyped */
export interface Section {
  name: string;
  url: string;
  reactRoutePath?: string;
  form?: Record<string, { schemaUrl: string }>;
  [key: string]: unknown;
}

/**
 * The client config LeftAndMain::getCombinedClientConfig() writes into `#ss-admin-config`; a field added on one side
 * must be added on the other. The CSRF token is not typed because its key is configurable
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
