/**
 * Asks before a block is archived; Cancel takes the initial focus.
 */
import * as React from 'react';
import { Button, Dialog } from '@silverstripe/admin-patterns';

export interface ArchiveBlockDialogProps {
  /** The block's title while the dialog is open, else null */
  title: string | null;
  onConfirm(): void;
  onCancel(): void;
}

export const ArchiveBlockDialog = ({ title, onConfirm, onCancel }: ArchiveBlockDialogProps) => (
  <Dialog
    open={title !== null}
    onClose={onCancel}
    header={title !== null ? `Archive "${title}"?` : 'Archive block?'}
    body={<p>The block is removed from this page and kept in the archive.</p>}
    footer={
      <>
        <Button variant="primary" onClick={onConfirm}>
          Archive
        </Button>
        <Button data-autofocus onClick={onCancel}>
          Cancel
        </Button>
      </>
    }
  />
);
