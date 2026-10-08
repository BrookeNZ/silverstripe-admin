/**
 * The form action the shell registers. Actions whose legacy behaviour runs only in the browser
 * (asset-admin's Editor opens an upload dialog for replacefile and a download for downloadfile) would
 * post the form here, so until a pilet implements them they render inert, saying so, and post nothing.
 */
import { Button, FormAction, fieldTitle } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

export const clientOnlyActions: ReadonlySet<string> = new Set(['action_replacefile', 'action_downloadfile']);

export const ShellFormAction = (props: FieldComponentProps) => {
  const { field } = props;
  if (!clientOnlyActions.has(field.name)) {
    return <FormAction {...props} />;
  }
  const noteId = `${field.id}_unavailable`;
  return (
    <span>
      <Button variant={field.primary ? 'primary' : 'secondary'} id={field.id} aria-disabled="true" aria-describedby={noteId}>
        {fieldTitle(field)}
      </Button>{' '}
      <span id={noteId}>(not available in the shell yet)</span>
    </span>
  );
};
