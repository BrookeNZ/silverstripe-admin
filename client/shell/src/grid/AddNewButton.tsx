import * as React from 'react';
import { Button, PlusCircleIcon } from '@silverstripe/admin-patterns';
import type { GridSlotProps } from './types';

export interface AddNewButtonProps extends GridSlotProps {
  label: string;
  url: string;
}

/** GridFieldAddNewButton, declared by the admin module as `GridField.AddNewButton` */
export const AddNewButton = ({ label, url }: AddNewButtonProps) => (
  <Button variant="primary" href={new URL(url, document.baseURI).href} icon={<PlusCircleIcon size="sm" />}>
    {label}
  </Button>
);
