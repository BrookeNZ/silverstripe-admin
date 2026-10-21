/**
 * `@silverstripe/admin` at runtime, served by the import map as `shared/admin.js`. The loader imports it by that bare
 * specifier, never a relative path, so the page holds one instance and modules read what the loader writes. It
 * has no runtime imports, so it is safe to import before the loader starts.
 *
 * `clientConfig()` is a function, not a `config` export, because an ES module cannot export a getter: a live `let`
 * binding reads `undefined`, though typed as present, until the loader sets it, and a copy taken by a bundler or a
 * test mock keeps that.
 */
import type { ClientConfig } from './types';
/** The client config the page carries, deep-frozen; throws before the loader has read it */
export declare function clientConfig(): Readonly<ClientConfig>;
