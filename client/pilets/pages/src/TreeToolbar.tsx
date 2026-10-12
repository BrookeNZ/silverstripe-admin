/**
 * The row above the page tree (Figma Site tree sidebar toolbar 2:3677): the primary "Add new" button,
 * then `actions`, where the batch actions button goes, then `end`, pushed to the row's end. The design's
 * list view toggle at the end of the row is not built.
 */
import type * as React from 'react';
import { AddIcon, Button } from '@silverstripe/admin-patterns';

export interface TreeToolbarProps {
  onAdd: () => void;
  actions?: React.ReactNode;
  end?: React.ReactNode;
}

export const TreeToolbar = ({ onAdd, actions, end }: TreeToolbarProps) => (
  <div className="pages-tree-toolbar">
    <Button variant="primary" icon={<AddIcon size="sm" />} onClick={onAdd}>
      Add new
    </Button>
    {actions}
    {end && <div className="pages-tree-toolbar__end">{end}</div>}
  </div>
);
