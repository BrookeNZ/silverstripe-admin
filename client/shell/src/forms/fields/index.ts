import type { ComponentType } from 'react';
import type { PiletApi } from 'piral-core';
import {
  CheckboxField,
  CompositeField,
  DatetimeField,
  FieldGroup,
  FormAction,
  HeaderField,
  HiddenField,
  LiteralField,
  OptionsetField,
  ReadonlyField,
  SingleSelectField,
  TabItem,
  Tabs,
  TextField,
} from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

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
  FormAction,
};

export function registerBuiltInFields(api: PiletApi): void {
  for (const [name, Component] of Object.entries(builtInFields)) {
    api.registerSilverstripeComponent(name, Component);
  }
}
