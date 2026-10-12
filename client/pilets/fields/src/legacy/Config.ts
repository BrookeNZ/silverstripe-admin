/**
 * Stands in for the admin's lib/Config: reads the client config through the Pilet API, which the
 * pilet's setup hands over before any field renders
 */
import type { PiletApi } from '@silverstripe/admin-shell';

let readConfig: PiletApi['getConfig'] | undefined;

export function connectConfig(api: PiletApi): void {
  readConfig = () => api.getConfig();
}

export default {
  get(key: string): unknown {
    return readConfig?.()[key];
  },
};
