/**
 * Value fields resolved by schemaType or by name. Each receives its value and change handler from the
 * form renderer, so none of them depends on the form library
 */
import * as React from 'react';
import type { FieldComponentProps, FormField } from '../types';
import { describedBy, FieldHolder, fieldTitle } from './FieldHolder';

function controlProps(field: FormField, error?: string) {
  return {
    id: field.id,
    name: field.name,
    disabled: field.disabled,
    readOnly: field.readOnly,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(field, error),
  };
}

function textValue(value: unknown): string {
  return value == null ? '' : String(value);
}

export const TextField: React.FC<FieldComponentProps> = ({ field, value, onChange, onBlur, error }) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <input
      {...controlProps(field, error)}
      className="shell-field__control"
      type="text"
      maxLength={typeof field.data.maxlength === 'number' ? field.data.maxlength : undefined}
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const HiddenField: React.FC<FieldComponentProps> = ({ field, value }) => (
  <input type="hidden" id={field.id} name={field.name} value={textValue(value)} />
);

export const CheckboxField: React.FC<FieldComponentProps> = ({ field, value, onChange, onBlur, error }) => (
  <FieldHolder field={field} error={error} labelFor={field.id} inline>
    <input
      {...controlProps(field, error)}
      className="shell-field__check"
      type="checkbox"
      checked={value === true || Number(value) === 1}
      onChange={(event) => onChange(event.target.checked ? 1 : 0)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const SingleSelectField: React.FC<FieldComponentProps> = ({ field, value, onChange, onBlur, error }) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <select
      {...controlProps(field, error)}
      className="shell-field__control"
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    >
      {Boolean(field.data.hasEmptyDefault) && <option value="">{textValue(field.data.emptyString)}</option>}
      {field.source.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.title}
        </option>
      ))}
    </select>
  </FieldHolder>
);

export const OptionsetField: React.FC<FieldComponentProps> = ({ field, value, onChange, onBlur, error }) => (
  <fieldset className="shell-field__choices" id={field.holderId} aria-describedby={describedBy(field, error)}>
    <legend className="shell-field__label">{fieldTitle(field)}</legend>
    {field.source.map((option) => {
      const id = `${field.id}_${option.value}`;
      return (
        <div className="shell-field shell-field--inline" key={option.value}>
          <input
            className="shell-field__check"
            type="radio"
            id={id}
            name={field.id}
            value={option.value}
            disabled={field.disabled || option.disabled}
            checked={textValue(value) === String(option.value)}
            onChange={() => onChange(option.value)}
            onBlur={onBlur}
          />
          <label className="shell-field__option" htmlFor={id}>
            {option.title}
          </label>
        </div>
      );
    })}
    {error && (
      <p className="shell-field__message" id={`${field.id}_message`}>
        {error}
      </p>
    )}
  </fieldset>
);

export const DatetimeField: React.FC<FieldComponentProps> = ({ field, value, onChange, onBlur, error }) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <input
      {...controlProps(field, error)}
      className="shell-field__control"
      type="datetime-local"
      step={1}
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const ReadonlyField: React.FC<FieldComponentProps> = ({ field, value }) => (
  <FieldHolder field={field}>
    <p className="shell-field__readonly" id={field.id}>
      {textValue(value)}
    </p>
  </FieldHolder>
);
