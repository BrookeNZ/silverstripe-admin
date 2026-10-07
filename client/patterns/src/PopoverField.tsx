import * as React from 'react';
import { fieldTitle } from './FieldHolder';
import { Menu, Popover } from './Popover';
import type { PopoverProps } from './Popover';
import type { FieldProps } from './types';

function popoverProps({ field }: FieldProps): PopoverProps {
  const title = fieldTitle(field);
  return {
    id: field.id,
    holderId: field.holderId,
    label: title || field.buttonLabel || 'More actions',
    title: title || undefined,
    panelTitle: field.panelTitle || undefined,
    align: field.align ?? undefined,
    placement: field.placement ?? undefined,
    disabled: field.disabled,
  };
}

/** A schema PopoverField: its child fields in a Popover */
export const PopoverField = (props: FieldProps) => (
  <Popover {...popoverProps(props)}>{props.renderFields(props.field.children)}</Popover>
);

/** Child actions in a Menu, such as the action bar's "More options" */
export const MenuField = (props: FieldProps) => <Menu {...popoverProps(props)}>{props.renderFields(props.field.children)}</Menu>;
