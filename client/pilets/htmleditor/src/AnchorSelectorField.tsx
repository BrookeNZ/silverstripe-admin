/**
 * An interim `AnchorSelectorField` (silverstripe/cms) for the link dialog's anchor form: a text input
 * suggesting the anchors in the content being edited. The cms field also lists the anchors of the page
 * chosen beside it from its `data.endpoint`; that belongs to a shared field for the fields pilet, which
 * LinkField needs too, and replaces this registration
 */
import * as React from 'react';
import { describedBy, FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';

export function createAnchorSelectorField(anchors: () => ReadonlyArray<string>) {
  const AnchorSelectorField = ({ field, value, onChange, onBlur, error }: FieldComponentProps<string | null>) => {
    const suggestions = anchors();
    const listId = `${field.id}_anchors`;
    return (
      <FieldHolder field={field} error={error} labelFor={field.id}>
        <input
          id={field.id}
          name={field.name}
          className="admin-field__control"
          type="text"
          list={suggestions.length > 0 ? listId : undefined}
          value={value ?? ''}
          readOnly={field.readOnly}
          disabled={field.disabled}
          aria-describedby={describedBy(field, error)}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((anchor) => (
              <option key={anchor} value={anchor} />
            ))}
          </datalist>
        )}
      </FieldHolder>
    );
  };
  return AnchorSelectorField;
}
