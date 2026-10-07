/**
 * A FormSchema form in the shared Dialog, with the form's actions in the dialog's footer after Cancel
 * rather than in an action bar inside the body. The form renders headless and each footer button posts
 * its own action through the form's handle; errors show in the body as on any form.
 */
import * as React from 'react';
import { Button, Dialog, fieldTitle } from '@silverstripe/admin-patterns';
import { FormSchemaForm } from './FormSchemaForm';
import type { FormField, FormSchemaFormHandle, SchemaFormDialogProps } from './types';

export const SchemaFormDialog = ({ open, header, schemaUrl, onClose, onSubmitted }: SchemaFormDialogProps) => {
  const handle = React.useRef<FormSchemaFormHandle>(null);
  const [actions, setActions] = React.useState<Array<FormField>>([]);
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setActions([]);
      setPending(null);
    }
  }, [open]);

  const submit = async (name: string) => {
    if (!handle.current || pending !== null) {
      return;
    }
    setPending(name);
    await handle.current.submit(name);
    setPending(null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header={header}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {actions.map((action) => (
            <Button
              key={action.name}
              id={action.id}
              variant={action.primary ? 'primary' : 'secondary'}
              disabled={action.disabled || action.readOnly || (pending !== null && pending !== action.name)}
              loading={pending === action.name}
              onClick={() => submit(action.name)}
            >
              {fieldTitle(action)}
            </Button>
          ))}
        </>
      }
    >
      {open && (
        <FormSchemaForm
          key={schemaUrl}
          schemaUrl={schemaUrl}
          headless
          handleRef={handle}
          onSubmitted={onSubmitted}
          onActionsChange={setActions}
        />
      )}
    </Dialog>
  );
};
