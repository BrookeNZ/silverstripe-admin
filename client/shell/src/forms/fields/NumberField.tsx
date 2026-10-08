/**
 * NumericField, which reaches this name through its Integer or Decimal `schemaType`. A text input with a
 * numeric keyboard rather than `type="number"` (legacy's choice), because the server parses the value
 * with its locale's formatter, and a number input would blank a value such as `1,5` it cannot read.
 */
import * as React from 'react';
import { TextField } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

export const NumberField = (props: FieldComponentProps) => (
  <TextField {...props} inputMode={props.field.schemaType === 'Integer' ? 'numeric' : 'decimal'} />
);
