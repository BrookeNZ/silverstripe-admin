/**
 * What a module imports from `@silverstripe/admin`: the types below and the runtime function (runtime.ts).
 * `setup()` receives the module's deep-frozen list item; the client config comes from `clientConfig()`.
 * ModuleMetadata is an interface, not an alias, so a module can augment it.
 */
export { clientConfig } from './runtime';
/** A module's item in the page's module list (`#ss-admin-modules`); every listed module loads with the page */
export interface ModuleMetadata {
    name: string;
    /** The import map specifier the loader imports the module by */
    specifier: string;
}
/**
 * What a module exports as `setup`. The item it receives is the module's handle for the admin's registration APIs,
 * which are still to come, and `setup` may receive further arguments after it. The loader waits for a returned promise
 * before the next module's setup runs
 */
export type ModuleSetup = (module: Readonly<ModuleMetadata>) => void | Promise<void>;
export interface Section {
    name: string;
    url: string;
    reactRoutePath?: string;
    form?: Record<string, {
        schemaUrl: string;
    }>;
    [key: string]: unknown;
}
export interface ClientConfig {
    sections: Array<Section>;
    baseUrl: string;
    absoluteBaseUrl: string;
    adminUrl: string;
    environment: string;
    debugging: boolean;
    [key: string]: unknown;
}
