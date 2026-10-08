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
import { DateField } from './DateField';
import { HtmlReadonlyField } from './HtmlReadonlyField';
import { LabelField } from './LabelField';
import { ListboxField } from './ListboxField';
import { LookupField } from './LookupField';
import { NumberField } from './NumberField';
import { ProportionConstraintField } from './ProportionConstraintField';
import { ServerHtmlField } from './ServerHtmlField';
import { ShellFormAction } from './ShellFormAction';
import { SudoModePasswordField } from './SudoModePasswordField';
import { ToggleCompositeField, toggleCompositeFieldClass } from './ToggleCompositeField';
import { UnsavedChangesIndicatorField } from './UnsavedChangesIndicatorField';

export const builtInFields: Readonly<Record<string, ComponentType<FieldComponentProps>>> = {
  TextField,
  NumberField,
  HiddenField,
  CheckboxField,
  SingleSelectField,
  OptionsetField,
  DateField,
  DatetimeField,
  ListboxField,
  ReadonlyField,
  LookupField,
  HtmlReadonlyField,
  LiteralField,
  HeaderField,
  LabelField,
  CompositeField,
  FieldGroup,
  ProportionConstraintField,
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

/**
 * Registered through the same Pilet API verb pilets use, so a pilet that registers one of these names
 * replaces the shell's component (the latest registration wins)
 */
export function registerBuiltInFields(api: PiletApi): void {
  for (const [name, Component] of Object.entries(builtInFields)) {
    api.registerSilverstripeComponent(name, Component);
  }
  // Section pilets render their record edit forms with the shell's renderer
  api.registerSilverstripeComponent('FormSchemaForm', FormSchemaForm);
  api.registerSilverstripeComponent('SchemaFormDialog', SchemaFormDialog);
}
