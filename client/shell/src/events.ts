/**
 * Pilet API event names the shell emits or listens for (PILET-API.md, "Shared state and events")
 */

/** Emitted after a save, publish, delete or other change to records; a view listing them re-reads them */
export const recordsChangedEvent = 'silverstripe:records-changed';

export interface RecordsChangedEvent {
  recordClass: string;
  ids: Array<number>;
}
