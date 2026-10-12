/**
 * The editor's link dialog, the named modal `InsertLinkModal`: a choice of link kind above the chosen kind's
 * server form, the shell's `SchemaFormDialog` drawn in the shell's modal frame. The form posts to the server,
 * which validates it (an email address, the link text when the selection had none) and answers with the
 * accepted values; the editor writes the link from them.
 *
 * An existing link opens on its own kind with its values in the schema URL's query, which the server loads
 * into the form; another kind starts empty.
 *
 * The modal unmounts when it closes, after the frame has put focus back where it was, so the editor hears
 * the outcome as the modal unmounts (`onInsert` after a post the server accepted, else `onCancel`) and can
 * then move focus into itself.
 */
import * as React from 'react';
import { Toggle } from '@silverstripe/admin-patterns';
import { linkSchemaUrl, stateValues } from './links';
import type { LinkKind, LinkValues } from './links';
import type { ModalComponentProps } from './shell';

// The legacy name of the link modal container
export const insertLinkModal = 'InsertLinkModal';

export interface LinkDialogRequest {
  kind: string;
  values: LinkValues;
  editing: boolean;
  requireText: boolean;
  /** The record the content belongs to, for the anchor form's anchors */
  itemId: number;
}

export interface InsertLinkModalOptions {
  request: LinkDialogRequest;
  kinds: ReadonlyArray<{ kind: LinkKind; schemaUrl: string }>;
  onInsert: (kind: LinkKind, values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const InsertLinkModal = ({ onClose, options, piral }: ModalComponentProps<typeof insertLinkModal>) => {
  const FormDialog = piral.getSilverstripeComponent('SchemaFormDialog');
  const [selected, setSelected] = React.useState(options?.request.kind ?? '');
  const inserted = React.useRef<[LinkKind, Record<string, unknown>] | null>(null);
  const [opened] = React.useState(options);

  React.useEffect(
    () => () => {
      if (inserted.current) {
        opened?.onInsert(...inserted.current);
      } else {
        opened?.onCancel();
      }
    },
    [opened],
  );

  if (!options) {
    return null;
  }
  const { request, kinds } = options;
  const current = kinds.find(({ kind }) => kind.name === selected) ?? kinds[0];
  if (!current) {
    return null;
  }
  const schemaUrl = linkSchemaUrl(current.schemaUrl, {
    itemId: request.itemId,
    requireText: request.requireText,
    editing: request.editing,
    values: current.kind.name === request.kind ? request.values : {},
  });

  return (
    <FormDialog
      open
      modal
      header={request.editing ? 'Edit link' : 'Insert link'}
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
      onSubmitted={(response) => {
        inserted.current = [current.kind, stateValues(response.state)];
        onClose();
      }}
    />
  );
};
