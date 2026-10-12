/**
 * The framework's ListboxField: a multiple choice from the field's source, shown as tokens in a combobox
 * as legacy's react-select did. The server's state sends the chosen options as `{ Title, Value }`
 * objects, and a change posts the chosen values alone (`DirectGroups[]=4`), as the legacy CMS form's
 * native multiple select did; the field's validator refuses the option objects.
 *
 * `lazyLoad` and `creatable` are not ported: the framework's ListboxField always sends them false, and
 * TagField, which sets them, has a component of its own.
 */
import { Combobox, describedBy, FieldHolder } from '@silverstripe/admin-patterns';
import type { ChoiceOption } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

function chosenValues(value: unknown): Array<string> {
  const items = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return items.map((item) => {
    if (item !== null && typeof item === 'object') {
      const option = item as { Value?: unknown; value?: unknown };
      return String(option.Value ?? option.value);
    }
    return String(item);
  });
}

export const ListboxField = ({ field, value, onChange, onBlur, error }: FieldComponentProps) => {
  const labelId = `${field.id}_label`;
  const chosen = chosenValues(value);
  const selected = field.source.filter((option) => chosen.includes(String(option.value)));
  const placeholder = field.attributes?.['data-placeholder'];
  return (
    <FieldHolder field={field} error={error} labelId={labelId}>
      <div onBlur={onBlur}>
        <Combobox<ChoiceOption>
          id={field.id}
          multiple
          clearable
          options={field.source}
          value={selected}
          onChange={(options) => onChange((options as Array<ChoiceOption>).map((option) => option.value))}
          getOptionValue={(option) => option.value}
          getOptionLabel={(option) => option.title}
          isOptionDisabled={(option) => Boolean(option.disabled)}
          placeholder={typeof placeholder === 'string' ? placeholder : undefined}
          disabled={field.disabled}
          readOnly={field.readOnly}
          aria-labelledby={labelId}
          aria-describedby={describedBy(field, error)}
          aria-invalid={error ? true : undefined}
        />
      </div>
    </FieldHolder>
  );
};
