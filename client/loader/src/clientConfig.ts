/**
 * Reads the JSON data blocks ChromePage writes, and hands the client config ChromePage::ClientConfig() writes into
 * #ss-admin-config to the runtime file before any entry loads
 */
import { setClientConfig } from './internals';
import type { ClientConfig } from './types';

// Keep in step with the ids in templates/SilverStripe/Admin/Client/ChromePage.ss
export const CONFIG_BLOCK_ID = 'ss-admin-config';
export const ENTRIES_BLOCK_ID = 'ss-admin-entries';

/** The parsed JSON of the data block with that id; undefined when the block is missing, empty or not valid JSON */
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

/** The client config block as an object; null when it is missing or holds anything but a JSON object */
export function readClientConfig(): ClientConfig | null {
  const value = readDataBlock(CONFIG_BLOCK_ID);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as ClientConfig;
}

/**
 * Hands a frozen copy of the page's client config to the runtime, then runs `start`. With no usable config block
 * (missing, empty, not JSON or not an object), or a `start` that throws, the admin logs one console error and does
 * nothing else, so no entry can run without config
 */
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

/** Freezes the value and every object reachable from it in place, stopping at anything already frozen */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
