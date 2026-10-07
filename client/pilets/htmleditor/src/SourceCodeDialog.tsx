/**
 * The editor's source code dialog, in place of the window TinyMCE's `code` plugin draws in its own skin:
 * the content's HTML in a textarea, written back to the editor on Save. Escape and Cancel discard the edit.
 *
 * The host gives each opening a new `key`, so the textarea starts from the content the dialog opened on.
 */
import * as React from 'react';
import { Button, Dialog } from '@silverstripe/admin-patterns';

export interface SourceCodeDialogProps {
  /** The HTML to edit; null while closed */
  content: string | null;
  onCancel(): void;
  onSave(html: string): void;
}

export const SourceCodeDialog = ({ content, onCancel, onSave }: SourceCodeDialogProps) => {
  const [draft, setDraft] = React.useState(content ?? '');
  const id = React.useId();

  return (
    <Dialog
      open={content !== null}
      onClose={onCancel}
      header="Source code"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            Save
          </Button>
        </>
      }
    >
      <div className="admin-field">
        <label className="admin-field__label" htmlFor={id}>
          Source code
        </label>
        <textarea
          id={id}
          className="admin-field__control htmleditor-source__code"
          rows={20}
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    </Dialog>
  );
};
