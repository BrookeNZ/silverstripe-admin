/**
 * `@silverstripe/admin` at runtime, served by the import map as `shared/admin.js`. The loader imports it by that bare
 * specifier, never a relative path, so the page holds one instance and entries read what the loader writes. It
 * has no runtime imports, so it is safe to import before the loader starts.
 *
 * `clientConfig()` is a function, not a `config` export, because an ES module cannot export a getter: a live `let`
 * binding reads `undefined`, though typed as present, until the loader sets it, and a copy taken by a bundler or a
 * test mock keeps that.
 */
import type { ClientConfig } from './types';

let config: Readonly<ClientConfig> | undefined;

/** The client config the page carries, deep-frozen; throws before the loader has read it */
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
    /** Stores the config `clientConfig()` returns; the loader passes it deep-frozen, so entries share it read-only */
    setClientConfig(value: Readonly<ClientConfig>): void {
      config = value;
    },
  };
}
