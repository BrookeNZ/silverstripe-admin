/**
 * The framework's LookupField: the titles of the chosen options as text. The server marks it read-only
 * and its `saveInto` does nothing, so it posts nothing
 */
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

function chosenTitles(field: FieldComponentProps['field'], value: unknown): string {
  const chosen = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String);
  return field.source
    .filter((option) => chosen.includes(String(option.value)))
    .map((option) => option.title)
    .join(', ');
}

export const LookupField = ({ field, value }: FieldComponentProps) => (
  <FieldHolder field={field}>
    <p className="admin-field__readonly" id={field.id}>
      {chosenTitles(field, value) || '(None)'}
    </p>
  </FieldHolder>
);
