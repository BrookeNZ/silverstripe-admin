/**
 * Elemental's TextCheckboxGroupField: a block's title input with its "Displayed" checkbox inline after
 * it, under the group's label, as legacy's input group drew them. The group is structural; its two
 * children (a TextField and a CheckboxField) are posted fields the form renders. Legacy drops the text
 * field's own label in favour of the group's, so this does too.
 */
import * as React from 'react';
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import './text-checkbox-group-field.css';

export const TextCheckboxGroupField = ({ field, error, renderFields }: FieldComponentProps) => {
  const [text, ...checkboxes] = field.children;
  if (!text) {
    return null;
  }
  return (
    <FieldHolder field={field} error={error} labelFor={text.id}>
      <div className="elemental-text-checkbox-group">
        <div className="elemental-text-checkbox-group__text">{renderFields([{ ...text, title: '' }])}</div>
        {checkboxes.length > 0 && <div className="elemental-text-checkbox-group__checkbox">{renderFields(checkboxes)}</div>}
      </div>
    </FieldHolder>
  );
};
