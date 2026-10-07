/**
 * Pilet API event names the shell emits or listens for (PILET-API.md, "Shared state and events"). The
 * shell package publishes types only, so pilets read the name from the Pilet API as
 * `api.recordsChangedEvent` instead of importing this module.
 */

/** Emitted after a save, publish, delete or other change to records; a view listing them re-reads them */
export const recordsChangedEvent = 'silverstripe:records-changed';

export type RecordsChangedEventName = typeof recordsChangedEvent;

export interface RecordsChangedEvent {
  recordClass: string;
  ids: Array<number>;
}

declare module 'piral-core/lib/types/custom' {
  interface PiralCustomEventMap {
    [recordsChangedEvent]: RecordsChangedEvent;
  }
}
