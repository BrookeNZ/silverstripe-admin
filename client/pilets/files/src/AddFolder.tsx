/**
 * The toolbar's Add a folder button and its dialog: asset-admin's `folderCreateForm` for the open folder in the
 * shell's SchemaFormDialog. Legacy showed the same form in its side panel; here the dialog's heading replaces the
 * form's own "New Folder" header group, and the form's placeholder folder preview is left out with it.
 *
 * The form's `createfolder` action answers with the new folder as `record`. Success announces the parent's
 * listing as changed and opens the new folder, keeping the view and sort; a refused post stays in the dialog,
 * where SchemaFormDialog shows it.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@silverstripe/admin-patterns';
import type { FormSchemaResponse, PiletApi } from '@silverstripe/admin-shell';
import { fileClass } from './api';
// Figma "White buttons" Add a folder in 2:6855; the patterns package has no folder glyph
import addFolderIcon from './assets/add-folder.svg';

export type AddFolderPiral = Pick<PiletApi, 'getSilverstripeComponent' | 'invalidateRecords'>;

export const addFolderOmittedFields: ReadonlyArray<string> = ['AssetEditorHeaderFieldGroup', 'PreviewImage'];

/** `schemaUrl` is the section's `folderCreateForm` schema URL, which takes the parent folder's id */
export function folderCreateSchemaUrl(schemaUrl: string, parentId: number): string {
  return `${schemaUrl.endsWith('/') ? schemaUrl : `${schemaUrl}/`}${parentId}`;
}

/** The new folder's id from the `createfolder` response, as legacy read it */
export function createdFolderId(response: FormSchemaResponse): number | null {
  const record = (response as { record?: { id?: unknown } }).record;
  const id = Number(record?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export interface AddFolderProps {
  piral: AddFolderPiral;
  schemaUrl: string;
  folderId: number;
  /** The open folder refuses edits, so a folder cannot be added to it */
  disabled: boolean;
  /** The route of a folder, keeping the view and sort */
  folderPath: (id: number) => string;
}

export const AddFolder = ({ piral, schemaUrl, folderId, disabled, folderPath }: AddFolderProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const SchemaFormDialog = piral.getSilverstripeComponent('SchemaFormDialog');

  const onSubmitted = (response: FormSchemaResponse) => {
    const id = createdFolderId(response);
    setOpen(false);
    piral.invalidateRecords(fileClass, [folderId]);
    if (id !== null) {
      navigate(folderPath(id));
    }
  };

  return (
    <>
      <Button variant="tertiary" icon={<img src={addFolderIcon} alt="" />} disabled={disabled} onClick={() => setOpen(true)}>
        Add a folder
      </Button>
      <SchemaFormDialog
        open={open}
        header="New folder"
        schemaUrl={folderCreateSchemaUrl(schemaUrl, folderId)}
        omitFields={addFolderOmittedFields}
        onClose={() => setOpen(false)}
        onSubmitted={onSubmitted}
      />
    </>
  );
};
