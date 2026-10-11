import type { PiletApi } from 'piral-core';
import { AddNewButton } from './AddNewButton';
import { TextCell, textCellComponent } from './cells';
import { DataTable } from './DataTable';
import { GridField } from './GridField';

export const gridFieldComponent = 'SilverStripe\\Forms\\GridField\\GridField';

export const addNewButtonComponent = 'GridField.AddNewButton';

export const dataTableComponent = 'DataTable';

/**
 * The grid, its default cell and slot components, and the data table pilets draw lists with; a pilet replaces
 * any of them by registering the same name
 */
export function registerGridComponents(api: PiletApi): void {
  api.registerSilverstripeComponent(gridFieldComponent, GridField);
  api.registerSilverstripeComponent(textCellComponent, TextCell);
  api.registerSilverstripeComponent(addNewButtonComponent, AddNewButton);
  api.registerSilverstripeComponent(dataTableComponent, DataTable);
}
