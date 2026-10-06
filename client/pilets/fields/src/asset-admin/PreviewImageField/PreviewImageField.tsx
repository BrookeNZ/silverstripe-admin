/**
 * Asset-admin's PreviewImageField, written fresh and read-only: the file's preview image linking to
 * the full file, its filename, and whether the file exists. The legacy component is mostly the replace
 * flow (a dropzone posting to `data.uploadFileEndpoint`, progress and undo held in Redux), which is out
 * of scope here; the field posts nothing either way. Belongs in asset-admin's own pilet once it has one
 */
import * as React from 'react';
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import './PreviewImageField.css';

export interface PreviewImageState {
  data: {
    url?: string;
    preview?: string;
    version?: number;
    exists?: boolean;
    category?: string;
    initialValues?: { FileFilename?: string };
  };
}

/** Appends the file version as `vid`, as the legacy field did, so a replaced file is not served from cache */
export function cacheBustUrl(url: string, version: number | undefined, base: string = document.baseURI): string {
  if (!version || url.startsWith('data:')) {
    return url;
  }
  const busted = new URL(url, base);
  busted.searchParams.set('vid', String(version));
  return busted.href;
}

const PreviewImageField: React.FC<FieldComponentProps<unknown, PreviewImageState>> = ({ field }) => {
  const data = field.data as PreviewImageState['data'];
  const filename = data.initialValues?.FileFilename ?? '';
  const previewUrl = data.preview || data.url;
  const isImage = !data.category || data.category === 'image';

  return (
    <FieldHolder field={field} label="">
      <figure className="preview-image-field" id={field.id}>
        {!data.exists && <p className="preview-image-field__status">File cannot be found</p>}
        {data.exists && isImage && previewUrl && (
          <a className="preview-image-field__link" href={cacheBustUrl(data.url ?? previewUrl, data.version)} target="_blank" rel="noopener noreferrer">
            <img
              className="preview-image-field__image"
              src={cacheBustUrl(previewUrl, data.version)}
              alt={`Open ${filename || 'the file'} at full size (opens in a new tab)`}
            />
          </a>
        )}
        {data.exists && !isImage && <p className="preview-image-field__status">No preview for this type of file</p>}
        <figcaption className="preview-image-field__filename">{filename}</figcaption>
      </figure>
    </FieldHolder>
  );
};

export default PreviewImageField;
