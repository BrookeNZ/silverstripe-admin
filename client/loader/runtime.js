let config;
/** The client config from the page, frozen so nothing can change it; throws if the loader has not read it yet */
export function clientConfig() {
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
        setClientConfig(value) {
            config = value;
        },
    };
}
