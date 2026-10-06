import * as React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface UnsavedChangesDialogProps {
  open: boolean;
  onStay(): void;
  onLeave(): void;
}

/**
 * Asks whether to leave with unsaved changes. Escape means stay; staying is primary and focused first,
 * matching the legacy confirm where Cancel stays
 */
export const UnsavedChangesDialog = ({ open, onStay, onLeave }: UnsavedChangesDialogProps) => (
  <Dialog
    open={open}
    onClose={onStay}
    header="You have unsaved changes"
    body="Your changes have not been saved. If you leave this page now, they will be lost."
    footer={
      <>
        <Button variant="primary" autoFocus onClick={onStay}>
          Stay on this page
        </Button>
        <Button onClick={onLeave}>Leave without saving</Button>
      </>
    }
  />
);
