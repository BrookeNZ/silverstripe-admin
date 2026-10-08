import type * as React from 'react';
import { Button } from './Button';
import { fieldTitle } from './FieldHolder';
import { PublishIcon, SavedIcon } from './icons';
import type { IconProps } from './icons';
import type { FieldDescriptor, FieldProps } from './types';

// Legacy font-icon names the design draws; other names render no icon until the design has them
const actionIcons: Readonly<Record<string, React.ComponentType<IconProps>>> = {
  rocket: PublishIcon,
  // The design has no save icon; its filled Save (Figma 2:6253) carries the tick
  save: SavedIcon,
  tick: SavedIcon,
};

/** A submit button carrying the action's name, so the form can tell which one was pressed */
export const FormAction = <F extends FieldDescriptor>({ field, submitting }: FieldProps<unknown, F>) => {
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
