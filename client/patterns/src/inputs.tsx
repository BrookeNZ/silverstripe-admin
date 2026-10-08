/**
 * Value fields. Each receives its value and change handler as props, so none of them depends on a form
 * library or on where the field's description came from
 */
import type * as React from 'react';
import { describedBy, FieldHolder, fieldTitle } from './FieldHolder';
import type { FieldDescriptor, FieldProps } from './types';

function controlProps(field: FieldDescriptor, error?: string) {
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

export interface TextFieldProps<F extends FieldDescriptor = FieldDescriptor> extends FieldProps<unknown, F> {
  /** The on-screen keyboard to offer, such as `decimal` for a number typed as text */
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

export const TextField = <F extends FieldDescriptor>({ field, value, onChange, onBlur, error, inputMode }: TextFieldProps<F>) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <input
      {...controlProps(field, error)}
      className="admin-field__control"
      type="text"
      inputMode={inputMode}
      maxLength={field.maxLength ?? undefined}
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const HiddenField = <F extends FieldDescriptor>({ field, value }: FieldProps<unknown, F>) => (
  <input type="hidden" id={field.id} name={field.name} value={textValue(value)} />
);

export const CheckboxField = <F extends FieldDescriptor>({ field, value, onChange, onBlur, error }: FieldProps<unknown, F>) => (
  <FieldHolder field={field} error={error} labelFor={field.id} inline>
    <input
      {...controlProps(field, error)}
      className="admin-field__check"
      type="checkbox"
      checked={value === true || Number(value) === 1}
      onChange={(event) => onChange(event.target.checked ? 1 : 0)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const SingleSelectField = <F extends FieldDescriptor>({ field, value, onChange, onBlur, error }: FieldProps<unknown, F>) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <select
      {...controlProps(field, error)}
      className="admin-field__control admin-field__control--select"
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    >
      {field.emptyOption != null && <option value="">{field.emptyOption}</option>}
      {field.source.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.title}
        </option>
      ))}
    </select>
  </FieldHolder>
);

export const OptionsetField = <F extends FieldDescriptor>({ field, value, onChange, onBlur, error }: FieldProps<unknown, F>) => (
  <fieldset className="admin-field__choices" id={field.holderId} aria-describedby={describedBy(field, error)}>
    <legend className="admin-field__label">{fieldTitle(field)}</legend>
    {field.source.map((option) => {
      const id = `${field.id}_${option.value}`;
      return (
        <div className="admin-field admin-field--inline" key={option.value}>
          <input
            className="admin-field__check"
            type="radio"
            id={id}
            name={field.id}
            value={option.value}
            disabled={field.disabled || option.disabled}
            checked={textValue(value) === String(option.value)}
            onChange={() => onChange(option.value)}
            onBlur={onBlur}
          />
          <label className="admin-field__option" htmlFor={id}>
            {option.title}
          </label>
        </div>
      );
    })}
    {error && (
      <p className="admin-field__message" id={`${field.id}_message`}>
        {error}
      </p>
    )}
  </fieldset>
);

export const DatetimeField = <F extends FieldDescriptor>({ field, value, onChange, onBlur, error }: FieldProps<unknown, F>) => (
  <FieldHolder field={field} error={error} labelFor={field.id}>
    <input
      {...controlProps(field, error)}
      className="admin-field__control"
      type="datetime-local"
      step={1}
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  </FieldHolder>
);

export const ReadonlyField = <F extends FieldDescriptor>({ field, value }: FieldProps<unknown, F>) => (
  <FieldHolder field={field}>
    <p className="admin-field__readonly" id={field.id}>
      {textValue(value)}
    </p>
  </FieldHolder>
);
