let config;
/** The client config the page carries, deep-frozen; throws before the loader has read it */
export function clientConfig() {
    if (!config) {
        throw new Error('The admin client config is not available yet: the admin loader has not read it from the page');
    }
    return config;
}
let claimed = false;
/**
 * For the loader only; every call after the first throws, so no module can claim the setter
 * @internal
 */
export function claimInternals() {
    if (claimed) {
        throw new Error('The admin runtime internals are claimed by the admin loader and cannot be claimed again');
    }
    claimed = true;
    return {
        setClientConfig(value) {
            config = value;
        },
    };
}
