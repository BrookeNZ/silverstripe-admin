import * as React from 'react';
import type { GridSlotProps } from './types';

export interface AddNewButtonProps extends GridSlotProps {
  label: string;
  url: string;
}

/** GridFieldAddNewButton, declared by the admin module as `GridField.AddNewButton` */
export const AddNewButton: React.FC<AddNewButtonProps> = ({ label, url }) => (
  <a className="admin-button admin-button--primary" href={new URL(url, document.baseURI).href}>
    {label}
  </a>
);
