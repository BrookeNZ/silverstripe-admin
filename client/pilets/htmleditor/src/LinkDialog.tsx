/**
 * The editor's link dialog: a choice of link kind above the chosen kind's server form, in the shell's
 * `SchemaFormDialog`. The form posts to the server, which validates it (an email address, the link text
 * when the selection had none) and answers with the accepted values; the editor writes the link from them.
 *
 * An existing link opens on its own kind with its values in the schema URL's query, which the server loads
 * into the form; another kind starts empty.
 */
import * as React from 'react';
import { Toggle } from '@silverstripe/admin-patterns';
import { linkSchemaUrl, stateValues } from './links';
import type { LinkKind, LinkValues } from './links';
import type { SchemaFormDialogProps } from './shell';

export interface LinkDialogRequest {
  kind: string;
  values: LinkValues;
  editing: boolean;
  requireText: boolean;
  /** The record the content belongs to, for the anchor form's anchors */
  itemId: number;
}

export interface LinkDialogProps {
  request: LinkDialogRequest | null;
  kinds: ReadonlyArray<{ kind: LinkKind; schemaUrl: string }>;
  FormDialog: React.ComponentType<SchemaFormDialogProps>;
  onClose: () => void;
  onSubmit: (kind: LinkKind, values: Record<string, unknown>) => void;
}

export const LinkDialog = ({ request, kinds, FormDialog, onClose, onSubmit }: LinkDialogProps) => {
  const [selected, setSelected] = React.useState(request?.kind ?? '');
  // The last request stays drawn while the dialog closes, and a new one opens on its own kind
  const [last, setLast] = React.useState(request);
  if (request && request !== last) {
    setLast(request);
    setSelected(request.kind);
  }

  const current = kinds.find(({ kind }) => kind.name === selected) ?? kinds.find(({ kind }) => kind.name === last?.kind) ?? kinds[0];
  if (!current || !last) {
    return null;
  }
  const schemaUrl = linkSchemaUrl(current.schemaUrl, {
    itemId: last.itemId,
    requireText: last.requireText,
    editing: last.editing,
    values: current.kind.name === last.kind ? last.values : {},
  });

  return (
    <FormDialog
      open={request !== null}
      header={last.editing ? 'Edit link' : 'Insert link'}
      intro={
        <Toggle
          label="Link to"
          options={kinds.map(({ kind }) => ({ key: kind.name, label: kind.label }))}
          value={current.kind.name}
          onChange={setSelected}
        />
      }
      schemaUrl={schemaUrl}
      onClose={onClose}
      onSubmitted={(response) => onSubmit(current.kind, stateValues(response.state))}
    />
  );
};
