/**
 * The framework's LabelField: its title as a label with no control. `data.target`, when a field sets
 * it, names the control the label is for, as legacy's component read it
 */
import { fieldTitle } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

export const LabelField = ({ field }: FieldComponentProps) => {
  const target = field.data.target;
  return (
    <label className="admin-field__label" id={field.id} htmlFor={typeof target === 'string' ? target : undefined}>
      {fieldTitle(field)}
    </label>
  );
};
