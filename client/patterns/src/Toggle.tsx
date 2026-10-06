/**
 * A segmented toggle between a few exclusive options, after the CMS Refresh "Draft/publish toggle"
 * (Figma "Draft published", node 2:6140). It is a radio group: each option is a native radio inside
 * its label, so Tab enters at the selected option and the arrow keys move the selection, and the
 * control is always controlled by `value` and `onChange`. Name it with `label`, or point
 * `aria-labelledby` at visible text.
 */
import * as React from 'react';

export interface ToggleOption<K extends string = string> {
  key: K;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface ToggleProps<K extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'role'> {
  options: ReadonlyArray<ToggleOption<K>>;
  value: K;
  onChange(value: K): void;
  /** The group's accessible name, when no visible text names it through `aria-labelledby` */
  label?: string;
  /** The radios' shared name; a unique one is generated when omitted */
  name?: string;
}

export const Toggle = <K extends string>({ options, value, onChange, label, name, className, ...rest }: ToggleProps<K>) => {
  const generatedName = React.useId();
  const groupName = name ?? generatedName;
  return (
    <div {...rest} className={['admin-toggle', className].filter(Boolean).join(' ')} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.key === value;
        const classes = [
          'admin-toggle__option',
          selected && 'admin-toggle__option--selected',
          option.disabled && 'admin-toggle__option--disabled',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <label className={classes} key={option.key}>
            <input
              className="admin-toggle__input"
              type="radio"
              name={groupName}
              value={option.key}
              checked={selected}
              disabled={option.disabled}
              onChange={() => onChange(option.key)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
};
