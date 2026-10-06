/**
 * Stands in for the admin's fieldHolder HOC: wraps a legacy field in the shared FieldHolder and hands it
 * the flat props FormBuilder used to pass. The schema-level props a field reads are typed by `P` and
 * picked by name, so nothing else from the schema reaches the legacy component
 */
import * as React from 'react';
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';

export default function fieldHolder<P extends object>(
  Field: React.ComponentType<any>,
  schemaPropNames: ReadonlyArray<keyof P & string>,
): React.FC<FieldComponentProps<any, P>> {
  const Held: React.FC<FieldComponentProps<any, P>> = ({ field, value, onChange, error }) => {
    const labelId = `${field.id}_label`;
    const schemaProps = Object.fromEntries(schemaPropNames.map((name) => [name, field[name]]));
    return (
      <FieldHolder field={field} error={error} labelId={labelId}>
        <Field
          {...schemaProps}
          id={field.id}
          name={field.name}
          disabled={field.disabled || field.readOnly}
          value={value}
          onChange={onChange}
          aria-labelledby={labelId}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${field.id}_message` : undefined}
        />
      </FieldHolder>
    );
  };
  Held.displayName = `FieldHolder(${Field.displayName ?? Field.name ?? 'Field'})`;
  return Held;
}
