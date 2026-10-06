/**
 * The form action the shell registers. Actions whose legacy behaviour runs only in the browser
 * (asset-admin's Editor opens an upload dialog for replacefile and a download for downloadfile) would
 * post the form here, so until a pilet implements them they render inert, saying so, and post nothing.
 */
import * as React from 'react';
import { FormAction, fieldTitle } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '../types';

export const clientOnlyActions: ReadonlySet<string> = new Set(['action_replacefile', 'action_downloadfile']);

export const ShellFormAction: React.FC<FieldComponentProps> = (props) => {
  const { field } = props;
  if (!clientOnlyActions.has(field.name)) {
    return <FormAction {...props} />;
  }
  const noteId = `${field.id}_unavailable`;
  return (
    <span>
      <button className="admin-button" type="button" id={field.id} aria-disabled="true" aria-describedby={noteId}>
        {fieldTitle(field)}
      </button>{' '}
      <span id={noteId}>(not available in the shell yet)</span>
    </span>
  );
};
