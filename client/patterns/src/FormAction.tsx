import * as React from 'react';
import { Button } from './Button';
import { fieldTitle } from './FieldHolder';
import { RocketIcon, TickIcon } from './icons';
import type { IconProps } from './icons';
import type { FieldProps } from './types';

// Legacy font-icon names the design draws; other names render no icon until the design has them
const actionIcons: Readonly<Record<string, React.ComponentType<IconProps>>> = {
  rocket: RocketIcon,
  tick: TickIcon,
};

/** A submit button carrying the action's name, so the form can tell which one was pressed */
export const FormAction = ({ field, submitting }: FieldProps) => {
  const ActionIcon = field.icon ? actionIcons[field.icon] : undefined;
  return (
    <Button
      variant={field.primary ? 'primary' : 'secondary'}
      type="submit"
      id={field.id}
      name={field.name}
      value="1"
      disabled={field.disabled || submitting}
      icon={ActionIcon && <ActionIcon size="sm" />}
    >
      {fieldTitle(field)}
    </Button>
  );
};
