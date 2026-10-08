import type { ComponentType } from 'react';
import type { PiletApi } from 'piral-core';
import {
  CheckboxField,
  CompositeField,
  DatetimeField,
  FieldGroup,
  HeaderField,
  HiddenField,
  LiteralField,
  MenuField,
  OptionsetField,
  PopoverField,
  ReadonlyField,
  SingleSelectField,
  TabItem,
  Tabs,
  TextField,
} from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';
import { FormSchemaForm } from '../FormSchemaForm';
import { SchemaFormDialog } from '../SchemaFormDialog';
import { serverHtmlComponent } from '../resolve';
import { NumberField } from './NumberField';
import { ServerHtmlField } from './ServerHtmlField';
import { ShellFormAction } from './ShellFormAction';
import { SudoModePasswordField } from './SudoModePasswordField';
import { ToggleCompositeField, toggleCompositeFieldClass } from './ToggleCompositeField';
import { UnsavedChangesIndicatorField } from './UnsavedChangesIndicatorField';

export const builtInFields: Readonly<Record<string, ComponentType<FieldComponentProps<any>>>> = {
  TextField,
  NumberField,
  HiddenField,
  CheckboxField,
  SingleSelectField,
  OptionsetField,
  DatetimeField,
  ReadonlyField,
  LiteralField,
  HeaderField,
  CompositeField,
  FieldGroup,
  [toggleCompositeFieldClass]: ToggleCompositeField,
  Tabs,
  TabItem,
  FormAction: ShellFormAction,
  PopoverField,
  MenuField,
  UnsavedChangesIndicator: UnsavedChangesIndicatorField,
  SudoModePasswordField,
  [serverHtmlComponent]: ServerHtmlField,
};

export function registerBuiltInFields(api: PiletApi): void {
  for (const [name, Component] of Object.entries(builtInFields)) {
    api.registerSilverstripeComponent(name, Component);
  }
  // Section pilets render their record edit forms with the shell's renderer
  api.registerSilverstripeComponent('FormSchemaForm', FormSchemaForm);
  api.registerSilverstripeComponent('SchemaFormDialog', SchemaFormDialog);
}
