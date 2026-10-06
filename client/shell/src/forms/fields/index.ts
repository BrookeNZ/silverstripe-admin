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
  OptionsetField,
  PopoverField,
  ReadonlyField,
  SingleSelectField,
  TabItem,
  Tabs,
  TextField,
} from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';
import { serverHtmlComponent } from '../resolve';
import { ServerHtmlField } from './ServerHtmlField';
import { ShellFormAction } from './ShellFormAction';
import { UnsavedChangesIndicatorField } from './UnsavedChangesIndicatorField';

export const builtInFields: Readonly<Record<string, ComponentType<FieldComponentProps<any>>>> = {
  TextField,
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
  Tabs,
  TabItem,
  FormAction: ShellFormAction,
  PopoverField,
  UnsavedChangesIndicator: UnsavedChangesIndicatorField,
  [serverHtmlComponent]: ServerHtmlField,
};

export function registerBuiltInFields(api: PiletApi): void {
  for (const [name, Component] of Object.entries(builtInFields)) {
    api.registerSilverstripeComponent(name, Component);
  }
}
