/**
 * Names this pilet shares through the Pilet API (Piral's event bus and data store), documented in
 * client/shell/PILET-API.md under "Shared state and events"
 */

/** The payload of the Pilet API's `recordsChangedEvent` */
export interface RecordsChangedEvent {
  recordClass: string;
  ids: Array<number>;
}

/** The page the Pages section is editing, or null; set with setData, read with getData */
export const currentPageDataKey = 'silverstripe:pages:current-page-id';
