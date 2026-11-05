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

let config: Readonly<ClientConfig> | undefined;

/** The client config from the page, frozen so nothing can change it; throws if the loader has not read it yet */
export function clientConfig(): Readonly<ClientConfig> {
  if (!config) {
    throw new Error('The admin client config is not available yet: the admin loader has not read it from the page');
  }
  return config;
}

let claimed = false;

/**
 * Returns the setter for `clientConfig()` to the first caller only; every later call throws. The loader calls it
 * first, from internals.ts, before any entry loads, so an entry that tries gets the error. Being first is the only
 * protection
 * @internal
 */
export function claimInternals() {
  if (claimed) {
    throw new Error('The admin runtime internals are claimed by the admin loader and cannot be claimed again');
  }
  claimed = true;
  return {
    /**
     * Sets what `clientConfig()` returns; the loader passes a frozen copy, so entries can read it but not change it
     */
    setClientConfig(value: Readonly<ClientConfig>): void {
      config = value;
    },
  };
}
