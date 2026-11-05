/**
 * The `@silverstripe/admin` package as the browser runs it, served by the import map as `shared/admin.js`. The
 * loader and every entry import it by that name, never by a relative path, so the page has one copy of this file
 * and entries read the config the loader wrote into it. It imports nothing at runtime, so it is safe to load first.
 *
 * `clientConfig()` is a function rather than an exported `config` variable because a module cannot export a
 * getter: an exported variable would read `undefined` until the loader sets it, and a bundler or a test mock that
 * copies the value would keep that `undefined`.
 */
import type { ClientConfig } from './types';
/** The client config from the page, frozen so nothing can change it; throws if the loader has not read it yet */
export declare function clientConfig(): Readonly<ClientConfig>;
