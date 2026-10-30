/**
 * Reads the JSON data blocks ChromePage writes, and hands the client config ChromePage::ClientConfig() writes into
 * #ss-admin-config to the runtime file before any module loads
 */
import { setClientConfig } from './internals';
import type { ClientConfig } from './types';

// Keep in step with the ids in templates/SilverStripe/Admin/Client/ChromePage.ss
export const CONFIG_BLOCK_ID = 'ss-admin-config';
export const MODULES_BLOCK_ID = 'ss-admin-modules';

/**
 * Undefined when the block is missing, empty or not valid JSON, so a JSON `null` stays distinguishable
 */
export function readDataBlock(id: string): unknown {
  const json = document.getElementById(id)?.textContent;
  if (!json) {
    return undefined;
  }
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export function readClientConfig(): ClientConfig | null {
  const value = readDataBlock(CONFIG_BLOCK_ID);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as ClientConfig;
}

export function startChrome(start: () => unknown): void {
  try {
    const config = readClientConfig();
    if (!config) {
      throw new Error(`The admin page must render the client config as #${CONFIG_BLOCK_ID}`);
    }
    setClientConfig(deepFreeze(structuredClone(config)));
    start();
  } catch (error) {
    console.error('The admin could not start', error);
  }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
