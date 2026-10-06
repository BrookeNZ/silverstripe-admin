import * as React from 'react';
import { fieldTitle } from './FieldHolder';
import type { FieldProps } from './types';

/** A submit button carrying the action's name, so the form can tell which one was pressed */
export const FormAction = ({ field, submitting }: FieldProps) => (
  <button
    className={field.primary ? 'admin-button admin-button--primary' : 'admin-button'}
    type="submit"
    id={field.id}
    name={field.name}
    value="1"
    disabled={field.disabled || submitting}
  >
    {fieldTitle(field)}
  </button>
);
