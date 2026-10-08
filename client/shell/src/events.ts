/**
 * Pilet API event names the shell emits or listens for (PILET-API.md, "Shared state and events"). The
 * shell package publishes types only, so pilets read the name from the Pilet API as
 * `api.recordsChangedEvent` instead of importing this module.
 */

// Spelled out rather than `typeof recordsChangedEvent`, so the emulator's declarations name no runtime value
export type RecordsChangedEventName = 'silverstripe:records-changed';

/** Emitted after a save, publish, delete or other change to records; a view listing them re-reads them */
export const recordsChangedEvent: RecordsChangedEventName = 'silverstripe:records-changed';

export interface RecordsChangedEvent {
  recordClass: string;
  /** Numbers; an empty list names every record of the class */
  ids: Array<number>;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomEventMap {
    'silverstripe:records-changed': RecordsChangedEvent;
  }
}
