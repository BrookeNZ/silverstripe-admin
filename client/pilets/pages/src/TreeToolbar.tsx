/**
 * The row above the page tree (Figma Site tree sidebar toolbar 2:3677): the primary "Add new" button,
 * then `actions`, where the batch actions button goes. The design's list view toggle at the end of the
 * row is not built.
 */
import * as React from 'react';
import { AddIcon, Button } from '@silverstripe/admin-patterns';

export interface TreeToolbarProps {
  onAdd(): void;
  actions?: React.ReactNode;
}

export const TreeToolbar = ({ onAdd, actions }: TreeToolbarProps) => (
  <div className="pages-tree-toolbar">
    <Button variant="primary" icon={<AddIcon size="sm" />} onClick={onAdd}>
      Add new
    </Button>
    {actions}
  </div>
);
