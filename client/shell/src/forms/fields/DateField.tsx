/**
 * The framework's DateField. With `html5` on (the default) a native date input, whose value and post are
 * ISO `Y-m-d` and whose `min` and `max` come from the schema data. With `html5` off the server sends and
 * parses the date in its own locale format (`Oct 9, 2026`), so a text input passes it through untouched;
 * legacy converted it to ISO, which the server then misread.
 */
import { describedBy, FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

interface DateFieldSchema {
  lang?: string | null;
}

const dataString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

export const DateField = ({ field, value, onChange, onBlur, error }: FieldComponentProps<unknown, DateFieldSchema>) => {
  const html5 = field.data.html5 !== false;
  return (
    <FieldHolder field={field} error={error} labelFor={field.id}>
      <input
        id={field.id}
        name={field.name}
        className="admin-field__control"
        type={html5 ? 'date' : 'text'}
        lang={field.lang ?? undefined}
        min={html5 ? dataString(field.data.min) : undefined}
        max={html5 ? dataString(field.data.max) : undefined}
        disabled={field.disabled}
        readOnly={field.readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(field, error)}
        value={value == null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </FieldHolder>
  );
};
