import * as React from 'react';
import type { FieldComponentProps } from '../types';
import { fieldTitle } from './FieldHolder';
import './button.css';

/** The form reads the pressed action from the submit event's submitter, so the button only carries its name */
export const FormAction: React.FC<FieldComponentProps> = ({ field, submitting }) => {
  const primary = /\bbtn--primary\b|\bbtn-primary\b/.test(field.extraClass ?? '');
  return (
    <button
      className={primary ? 'shell-button shell-button--primary' : 'shell-button'}
      type="submit"
      id={field.id}
      name={field.name}
      value="1"
      disabled={field.disabled || submitting}
    >
      {fieldTitle(field)}
    </button>
  );
};
