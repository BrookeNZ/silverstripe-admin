import * as React from 'react';
import { Button } from './Button';
import { fieldTitle } from './FieldHolder';
import type { FieldProps } from './types';

/** A submit button carrying the action's name, so the form can tell which one was pressed */
export const FormAction = ({ field, submitting }: FieldProps) => (
  <Button
    variant={field.primary ? 'primary' : 'secondary'}
    type="submit"
    id={field.id}
    name={field.name}
    value="1"
    disabled={field.disabled || submitting}
  >
    {fieldTitle(field)}
  </Button>
);
