/**
 * Stands in for the admin's fieldHolder HOC and the FormBuilder props it relied on: turns the shell
 * renderer's FieldComponentProps into the flat props a legacy field reads, and wraps the field in a
 * label, description and message. The shell's own FieldHolder is not exposed to pilets, so this one
 * mirrors its markup and reads its tokens
 */
import * as React from 'react';
import type { FieldComponentProps, FormField } from '@silverstripe/admin-shell';
import './FieldHolder.css';

// FormField keys the holder consumes or the shell renderer owns; everything else is the field's own schema
const holderKeys = new Set<string>([
  'attributes',
  'children',
  'component',
  'data',
  'description',
  'extraClass',
  'holderId',
  'key',
  'leftTitle',
  'message',
  'readOnly',
  'rightTitle',
  'schemaType',
  'source',
  'title',
  'type',
  'value',
]);

function schemaProps(field: FormField): Record<string, unknown> {
  return Object.fromEntries(Object.entries(field).filter(([key]) => !holderKeys.has(key)));
}

function fieldTitle(field: FormField): string {
  return typeof field.title === 'string' || typeof field.title === 'number' ? String(field.title) : '';
}

export default function fieldHolder(Field: React.ComponentType<any>): React.FC<FieldComponentProps<any>> {
  const FieldHolder: React.FC<FieldComponentProps<any>> = ({ field, value, onChange, error }) => {
    const title = fieldTitle(field);
    const labelId = `${field.id}_label`;
    return (
      <div className="ss-field-holder" id={field.holderId}>
        {title !== '' && (
          <span className="ss-field-holder__label" id={labelId}>
            {title}
          </span>
        )}
        <Field
          {...field.data}
          {...schemaProps(field)}
          disabled={field.disabled || field.readOnly}
          value={value}
          onChange={onChange}
          aria-labelledby={title !== '' ? labelId : undefined}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${field.id}_message` : undefined}
        />
        {field.description && (
          <p className="ss-field-holder__description" id={`${field.id}_description`}>
            {field.description}
          </p>
        )}
        {error && (
          <p className="ss-field-holder__message" id={`${field.id}_message`}>
            {error}
          </p>
        )}
      </div>
    );
  };
  FieldHolder.displayName = `FieldHolder(${Field.displayName ?? Field.name ?? 'Field'})`;
  return FieldHolder;
}
