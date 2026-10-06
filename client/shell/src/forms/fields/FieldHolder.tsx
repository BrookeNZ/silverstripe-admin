import * as React from 'react';
import type { FormField } from '../types';
import './field.css';

export function describedBy(field: FormField, error?: string): string | undefined {
  const ids = [field.description ? `${field.id}_description` : null, error ? `${field.id}_message` : null];
  return ids.filter(Boolean).join(' ') || undefined;
}

export function fieldTitle(field: FormField): string {
  return typeof field.title === 'string' || typeof field.title === 'number' ? String(field.title) : '';
}

interface FieldHolderProps {
  field: FormField;
  error?: string;
  inline?: boolean;
  label?: React.ReactNode;
  labelFor?: string;
  children: React.ReactNode;
}

export const FieldHolder: React.FC<FieldHolderProps> = ({ field, error, inline, label, labelFor, children }) => {
  const title = label ?? fieldTitle(field);
  return (
    <div className={inline ? 'shell-field shell-field--inline' : 'shell-field'} id={field.holderId}>
      {inline && children}
      {title !== '' &&
        (labelFor ? (
          <label className="shell-field__label" htmlFor={labelFor}>
            {title}
          </label>
        ) : (
          <span className="shell-field__label">{title}</span>
        ))}
      {!inline && children}
      {field.description && (
        <p className="shell-field__description" id={`${field.id}_description`}>
          {field.description}
        </p>
      )}
      {error && (
        <p className="shell-field__message" id={`${field.id}_message`}>
          {error}
        </p>
      )}
    </div>
  );
};
