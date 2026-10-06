import type { PiletApi } from 'piral-core';
import { AddNewButton } from './AddNewButton';
import { TextCell, textCellComponent } from './cells';
import { GridField } from './GridField';

export const gridFieldComponent = 'SilverStripe\\Forms\\GridField\\GridField';

export const addNewButtonComponent = 'GridField.AddNewButton';

/** The grid and its default cell and slot components; a pilet replaces any of them by registering the same name */
export function registerGridComponents(api: PiletApi): void {
  api.registerSilverstripeComponent(gridFieldComponent, GridField);
  api.registerSilverstripeComponent(textCellComponent, TextCell);
  api.registerSilverstripeComponent(addNewButtonComponent, AddNewButton);
}
