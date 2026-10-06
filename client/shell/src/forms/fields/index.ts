import type { ComponentType } from 'react';
import type { PiletApi } from 'piral-core';
import type { FieldComponentProps } from '../types';
import { FormAction } from './FormAction';
import { CheckboxField, DatetimeField, HiddenField, OptionsetField, ReadonlyField, SingleSelectField, TextField } from './inputs';
import { CompositeField, FieldGroup, HeaderField, LiteralField, TabItem, Tabs } from './structure';

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
