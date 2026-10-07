/**
 * A FormSchema form in the shared Dialog, with the form's actions in the dialog's footer after Cancel
 * rather than in an action bar inside the body. The form renders headless and each footer button posts
 * its own action through the form's handle, and Enter in a field posts the first action; the posting
 * action's button shows it is busy either way. Errors show in the body as on any form.
 *
 * The form is still loading when the dialog opens, so the heading takes focus first and the first field
 * once the schema has loaded, unless focus has moved on meanwhile.
 */
import * as React from 'react';
import { Button, Dialog, fieldTitle } from '@silverstripe/admin-patterns';
import { FormSchemaForm } from './FormSchemaForm';
import type { FormField, FormSchemaFormHandle, SchemaFormDialogProps } from './types';

const firstField = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"]';

export const SchemaFormDialog = ({ open, header, schemaUrl, onClose, onSubmitted }: SchemaFormDialogProps) => {
  const handle = React.useRef<FormSchemaFormHandle>(null);
  const [actions, setActions] = React.useState<Array<FormField>>([]);
  const [pending, setPending] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const body = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      setActions([]);
      setPending(null);
      setLoaded(false);
    }
  }, [open]);

  React.useEffect(() => {
    const dialog = body.current?.closest('dialog');
    if (!loaded || !dialog) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === dialog.querySelector('h2')) {
        body.current?.querySelector<HTMLElement>(firstField)?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded]);

  const submitting = React.useRef(false);
  const submit = async (name: string) => {
    if (!handle.current || submitting.current) {
      return;
    }
    submitting.current = true;
    setPending(name);
    try {
      await handle.current.submit(name);
    } finally {
      submitting.current = false;
      setPending(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header={header}
      focusHeading
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
      <div ref={body}>
        {open && (
          <FormSchemaForm
            key={schemaUrl}
            schemaUrl={schemaUrl}
            headless
            handleRef={handle}
            onLoad={() => setLoaded(true)}
            onSubmitted={onSubmitted}
            onActionsChange={setActions}
            onSubmittingChange={setPending}
          />
        )}
      </div>
    </Dialog>
  );
};
