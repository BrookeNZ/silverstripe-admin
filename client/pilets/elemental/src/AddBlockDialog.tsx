import * as React from 'react';
import { Button, Combobox, Dialog, FieldHolder } from '@silverstripe/admin-patterns';
import type { ElementType } from './blocks';

export interface AddBlockDialogProps {
  open: boolean;
  types: ReadonlyArray<ElementType>;
  adding: boolean;
  onAdd(type: ElementType): void;
  onClose(): void;
}

/** The design has no block type picker; this is a dialog holding a searchable list of the allowed types */
export const AddBlockDialog = ({ open, types, adding, onAdd, onClose }: AddBlockDialogProps) => {
  const [chosen, setChosen] = React.useState<ElementType | null>(null);
  const labelId = React.useId();
  const inputId = React.useId();

  React.useEffect(() => {
    if (!open) {
      setChosen(null);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header="Add a block"
      body={
        <FieldHolder field={{ id: inputId, title: 'Block type' }} labelFor={inputId} labelId={labelId}>
          {open && (
            <Combobox<ElementType>
              id={inputId}
              aria-labelledby={labelId}
              options={types}
              value={chosen}
              searchable
              getOptionValue={(type) => type.class}
              getOptionLabel={(type) => type.title}
              onChange={(value) => setChosen(value as ElementType | null)}
              noOptionsMessage="No block type matches"
            />
          )}
        </FieldHolder>
      }
      footer={
        <>
          <Button variant="primary" loading={adding} aria-disabled={!chosen || undefined} onClick={() => chosen && onAdd(chosen)}>
            Add block
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    />
  );
};
