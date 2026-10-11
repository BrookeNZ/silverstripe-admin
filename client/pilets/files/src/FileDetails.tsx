/**
 * The file open in the shell's details panel (Figma "Sidebar preview" 2:39635): the panel's header carries the
 * file's title, a Draft badge for a file only on draft, and its dimensions and size; the body is the preview on
 * a blurred copy of itself (Image preview 2:39647) above the `fileEditForm`, whose tabs, fields and action bar
 * (Saved, Publish and the more menu) are the form schema's own. The panel stays open while the route names the
 * file, and closing it goes back to the folder with the view, sort and page it was opened from.
 *
 * A save announces the file as a changed record, which refetches the folder listing, so a new title shows on
 * the tile or row; the header reads the saved state the form reports.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormSchemaFormProps, FormSchemaState, PiletApi } from '@silverstripe/admin-shell';
import { fieldTitle } from '@silverstripe/admin-patterns';
import type { FileItem } from './api';
import { fileDetails, panelOmittedFields } from './fileState';
import type { FileDetails, FilePreview } from './fileState';
// Figma "Image/doc file" Type=Document 2:6521, the 50px document glyph, as on the gallery tile
import documentIcon from './assets/document.svg';

export type DetailsPiral = Pick<PiletApi, 'openPanel' | 'getSilverstripeComponent' | 'showNotification'>;

/** The panel's id for a file, which `usePanel` reports */
export function filePanelId(fileId: number): string {
  return `file-${fileId}`;
}

// Gallery.tsx and FileTable.tsx put it on each file's link, for returning focus when the file's panel closes
const fileLinkAttribute = 'data-file-link';

interface PreviewProps {
  preview: FilePreview;
  title: string;
}

const Preview = ({ preview, title }: PreviewProps) => {
  if (!preview.exists) {
    return <p className="admin-error-text">File cannot be found</p>;
  }
  if (!preview.isImage) {
    return (
      <div className="files-preview">
        <img src={documentIcon} alt="" />
      </div>
    );
  }
  return (
    <a className="files-preview" href={preview.href} target="_blank" rel="noopener noreferrer">
      <img className="files-preview__ground" src={preview.src} alt="" />
      <img className="files-preview__image" src={preview.src} alt={`Open ${preview.filename || title} at full size (opens in a new tab)`} />
    </a>
  );
};

interface FileDetailsBodyProps {
  FormSchemaForm: React.ComponentType<FormSchemaFormProps>;
  schemaUrl: string;
  title: string;
  preview: FilePreview | null;
  onStateChange: (state: FormSchemaState) => void;
  onSubmitted: FormSchemaFormProps['onSubmitted'];
}

const FileDetailsBody = ({ FormSchemaForm, schemaUrl, title, preview, onStateChange, onSubmitted }: FileDetailsBodyProps) => (
  <div className="files-details">
    {preview && (
      <div className="shell-page__inset">
        <Preview preview={preview} title={title} />
      </div>
    )}
    <FormSchemaForm schemaUrl={schemaUrl} omitFields={panelOmittedFields} onStateChange={onStateChange} onSubmitted={onSubmitted} />
  </div>
);

export interface FileDetailsPanelProps {
  piral: DetailsPiral;
  fileId: number;
  /** The section's `fileEditForm` schema URL, which takes the file id */
  schemaUrl: string;
  /** The file's row in the listing on screen, when it is there */
  item: FileItem | undefined;
  /** The folder route the file was opened from */
  closePath: string;
}

/** Opens the panel for as long as it is mounted; renders nothing itself */
export const FileDetailsPanel = ({ piral, fileId, schemaUrl, item, closePath }: FileDetailsPanelProps) => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = React.useState<{ fileId: number; details: FileDetails } | null>(null);
  const details = loaded?.fileId === fileId ? loaded.details : null;
  const title = details?.title ?? item?.title ?? 'File details';
  const FormSchemaForm = piral.getSilverstripeComponent('FormSchemaForm');
  const formUrl = schemaUrl + encodeURIComponent(String(fileId));

  const onStateChange = React.useCallback((state: FormSchemaState) => setLoaded({ fileId, details: fileDetails(state, document.baseURI) }), [fileId]);
  const onSubmitted = React.useCallback<NonNullable<FormSchemaFormProps['onSubmitted']>>(
    (_response, action) => piral.showNotification(`${fieldTitle(action)} succeeded`, { type: 'success' }),
    [piral],
  );

  const meta = details?.meta ?? [];
  const metaKey = meta.join('|');
  const preview = details?.preview ?? null;
  const draft = Boolean(item?.draft);

  React.useEffect(
    () =>
      piral.openPanel({
        id: filePanelId(fileId),
        title,
        badge: draft ? 'Draft' : undefined,
        meta: metaKey ? metaKey.split('|') : [],
        closeLabel: 'Close file details',
        content: (
          <FileDetailsBody
            FormSchemaForm={FormSchemaForm}
            schemaUrl={formUrl}
            title={title}
            preview={preview}
            onStateChange={onStateChange}
            onSubmitted={onSubmitted}
          />
        ),
        onClose: () => navigate(closePath),
        returnFocus: () => document.querySelector<HTMLElement>(`[${fileLinkAttribute}="${fileId}"]`),
      }),
    [piral, fileId, title, draft, metaKey, preview, FormSchemaForm, formUrl, onStateChange, onSubmitted, navigate, closePath],
  );

  return null;
};
