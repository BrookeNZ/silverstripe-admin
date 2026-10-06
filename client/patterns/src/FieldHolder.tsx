import * as React from 'react';
import type { FieldDescriptor } from './types';

type HeldField = Pick<FieldDescriptor, 'id' | 'holderId' | 'title' | 'description'>;

export function fieldTitle(field: Pick<FieldDescriptor, 'title'>): string {
  return typeof field.title === 'string' || typeof field.title === 'number' ? String(field.title) : '';
}

export function describedBy(field: HeldField, error?: string): string | undefined {
  const ids = [field.description ? `${field.id}_description` : null, error ? `${field.id}_message` : null];
  return ids.filter(Boolean).join(' ') || undefined;
}

export interface FieldHolderProps {
  field: HeldField;
  error?: string;
  /** Puts the control before its label, for checkboxes and radios */
  inline?: boolean;
  label?: React.ReactNode;
  /** The control's id, when it is a native element a <label for> can name */
  labelFor?: string;
  /** An id for the label, for a custom control that names itself with aria-labelledby */
  labelId?: string;
  children: React.ReactNode;
}

/** Label, control, description and error message around one field */
export const FieldHolder: React.FC<FieldHolderProps> = ({ field, error, inline, label, labelFor, labelId, children }) => {
  const title = label ?? fieldTitle(field);
  return (
    <div className={inline ? 'admin-field admin-field--inline' : 'admin-field'} id={field.holderId}>
      {inline && children}
      {title !== '' &&
        (labelFor ? (
          <label className="admin-field__label" htmlFor={labelFor} id={labelId}>
            {title}
          </label>
        ) : (
          <span className="admin-field__label" id={labelId}>
            {title}
          </span>
        ))}
      {!inline && children}
      {field.description && (
        <p className="admin-field__description" id={`${field.id}_description`}>
          {field.description}
        </p>
      )}
      {error && (
        <p className="admin-field__message" id={`${field.id}_message`}>
          {error}
        </p>
      )}
    </div>
  );
};
