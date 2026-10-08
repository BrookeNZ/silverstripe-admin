/**
 * The field when read-only or disabled: the selected titles as static text, with the value in a
 * hidden input.
 */
import React from 'react';

export interface TreeDropdownReadOnlyProps {
  id: string;
  name: string;
  value: any;
  className: string;
  readOnly?: boolean;
  disabled?: boolean;
  data: { multiple?: boolean; hasEmptyDefault?: boolean; emptyString?: string };
  selectedValues: Array<any>;
}

export const TreeDropdownReadOnly = ({ id, name, value, className, readOnly, disabled, data, selectedValues }: TreeDropdownReadOnlyProps) => {
  let title = (data.hasEmptyDefault) ? data.emptyString : '';

  if (data.multiple) {
    const values = (Array.isArray(value) ? value : [])
      .map((item) => (
        // assumes all selected values had been populated into `selectedValues`
        selectedValues.find((selected) => selected.id === item) ||
        item
      ));

    title = values.map(item => item.title).join(', ');
  } else {
    const selected = selectedValues.find((item) => item.id === value);
    title = value;

    if (selected && typeof selected.title === 'string') {
      title = selected.title;
    }
  }

  return (
    <div className={className}>
      <span
        className="treedropdownfield__title"
        role="textbox"
        aria-readonly="true"
        tabIndex={0}
      >{title}</span>
      <input
        type="hidden"
        name={name}
        value={value}
        id={id}
        readOnly={readOnly}
        disabled={disabled}
      />
    </div>
  );
};
