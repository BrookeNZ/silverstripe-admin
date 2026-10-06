import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, AddIcon } from '@silverstripe/admin-patterns';
import { isNewTabClick, routerPath } from '../routing';
import type { GridSlotProps } from './types';

export interface AddNewButtonProps extends GridSlotProps {
  label: string;
  url: string;
}

/** GridFieldAddNewButton, declared by the admin module as `GridField.AddNewButton`; opens the new record form in the shell */
export const AddNewButton = ({ label, url }: AddNewButtonProps) => {
  const navigate = useNavigate();
  const path = routerPath(url);
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (path && !isNewTabClick(event)) {
      event.preventDefault();
      navigate(path);
    }
  };
  return (
    <Button variant="primary" href={new URL(url, document.baseURI).href} icon={<AddIcon size="sm" />} onClick={onClick}>
      {label}
    </Button>
  );
};
