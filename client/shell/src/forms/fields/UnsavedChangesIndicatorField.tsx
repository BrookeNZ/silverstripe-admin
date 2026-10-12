import * as React from 'react';
import { UnsavedChangesIndicator } from '@silverstripe/admin-patterns';
import type { UnsavedChangesMinutes } from '@silverstripe/admin-patterns';
import { FormDirtyContext } from '../context';
import type { FieldComponentProps } from '../types';

/** UnsavedChangesIndicator sends its thresholds at the top level of its schema entry */
export interface UnsavedChangesIndicatorSchema {
  minutes: UnsavedChangesMinutes;
}

/** Feeds the surrounding form's dirty state to the shared indicator */
export const UnsavedChangesIndicatorField = ({ field }: FieldComponentProps<unknown, UnsavedChangesIndicatorSchema>) => {
  const dirty = React.useContext(FormDirtyContext);
  return <UnsavedChangesIndicator id={field.id} dirty={dirty} minutes={field.minutes} />;
};
