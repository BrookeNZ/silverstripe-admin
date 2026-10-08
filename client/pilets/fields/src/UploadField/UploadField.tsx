/**
 * Asset-admin's UploadField, written fresh after the CMS Refresh "Image field" design (node 2:6066): an
 * empty state that takes a file from a button or a drop, and a row per attached file with its
 * thumbnail, name, type and size, a link to the file in the files section and a remove button.
 *
 * Data contract, from UploadField::getSchemaDataDefaults() and getSchemaStateDefaults(): schema `data`
 * carries `endpoints.createFile.url` (the field's own `upload` action), `maxFilesize` in MB (0 for no
 * field limit), `maxFiles`, `multi`, `canUpload` and `canAttach`; state `data.files` describes the
 * attached files and the value is `{Files: [id, ...]}`, which FileUploadReceiver reads back from a post
 * of `<Name>[Files][]=<id>`. Removing a file only detaches it; the File record stays in the files
 * section, as before.
 *
 * Not ported: choosing an existing file (the legacy InsertMediaModal), editing a file's details in
 * place, and the client-side thumbnail drawn before the upload finishes. Belongs in asset-admin's own
 * pilet once it has one.
 */
import * as React from 'react';
import { describedBy, FieldHolder, PreviewIcon, RemoveIcon, Stack, UploadIcon } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import Config from '../legacy/Config';
import { fileMeta, uploadFile } from './uploadFile';
import type { UploadedFile } from './uploadFile';
import './UploadField.css';

export interface UploadFieldValue {
  Files: Array<number | string>;
}

export interface UploadFieldData {
  endpoints?: { createFile?: { url: string } };
  maxFilesize?: number;
  maxFiles?: number | null;
  multi?: boolean;
  canUpload?: boolean;
  canAttach?: boolean;
  files?: Array<UploadedFile>;
}

interface PendingUpload {
  key: string;
  name: string;
  progress: number;
}

export function fileIds(value: UploadFieldValue | null | undefined): Array<number> {
  return Array.isArray(value?.Files) ? value.Files.map(Number).filter((id) => id > 0) : [];
}

function byId(files: Array<UploadedFile> | undefined): Record<number, UploadedFile> {
  return Object.fromEntries((files ?? []).map((file) => [file.id, file]));
}

function fileName(file: UploadedFile | undefined, id: number): string {
  return file?.name || file?.title || `File ${id}`;
}

/** The files section's edit route for a file, which the shell and the legacy admin both serve */
function fileEditUrl(id: number): string {
  return new URL(`admin/assets/edit/${id}`, document.baseURI).href;
}

const UploadField = ({ field, value, onChange, error }: FieldComponentProps<UploadFieldValue | null>) => {
  const data = field.data as UploadFieldData;
  const ids = fileIds(value);
  const [known, setKnown] = React.useState(() => byId(data.files));
  const [pending, setPending] = React.useState<Array<PendingUpload>>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const focusAfterRemove = React.useRef(false);
  const input = React.useRef<HTMLInputElement>(null);
  const uploadButton = React.useRef<HTMLButtonElement>(null);
  const group = React.useRef<HTMLDivElement>(null);
  const latestIds = React.useRef(ids);
  React.useLayoutEffect(() => {
    latestIds.current = ids;
  });
  const [mergedFiles, setMergedFiles] = React.useState(data.files);
  if (data.files !== mergedFiles) {
    setMergedFiles(data.files);
    setKnown((current) => ({ ...current, ...byId(data.files) }));
  }

  const editable = !field.readOnly && !field.disabled;
  const multi = Boolean(data.multi);
  const maxFiles = data.maxFiles && data.maxFiles > 0 ? data.maxFiles : null;
  const endpoint = data.endpoints?.createFile?.url;
  const busy = pending.length > 0;
  const full = multi ? maxFiles !== null && ids.length + pending.length >= maxFiles : ids.length + pending.length > 0;
  const canUpload = editable && data.canUpload !== false && Boolean(endpoint) && !full;
  const shownError = uploadError ?? error;
  const labelId = `${field.id}_label`;

  // After a removal renders, focus goes to the upload button it may have brought back
  React.useEffect(() => {
    if (focusAfterRemove.current) {
      focusAfterRemove.current = false;
      (uploadButton.current ?? group.current)?.focus();
    }
  });

  const upload = async (files: Array<File>) => {
    if (!endpoint || files.length === 0) {
      return;
    }
    setUploadError(null);
    const room = multi ? (maxFiles === null ? files.length : maxFiles - ids.length - pending.length) : 1;
    const accepted = files.slice(0, Math.max(room, 0));
    const errors: Array<string> = [];
    if (accepted.length < files.length) {
      errors.push(maxFiles === 1 || !multi ? 'Only one file can be attached' : `Only ${maxFiles} files can be attached`);
    }
    const limit = data.maxFilesize && data.maxFilesize > 0 ? data.maxFilesize * 1024 * 1024 : null;

    for (const file of accepted) {
      if (limit !== null && file.size > limit) {
        errors.push(`${file.name} is larger than ${data.maxFilesize} MB`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPending((current) => [...current, { key, name: file.name, progress: 0 }]);
      setStatus(`Uploading ${file.name}`);
      try {
        const uploaded = await uploadFile(endpoint, file, String(Config.get('SecurityID') ?? ''), (progress) =>
          setPending((current) => current.map((item) => (item.key === key ? { ...item, progress } : item))),
        );
        setKnown((current) => ({ ...current, [uploaded.id]: uploaded }));
        const next = multi ? [...latestIds.current, uploaded.id] : [uploaded.id];
        latestIds.current = next;
        onChange({ Files: next });
        setStatus(`Uploaded ${file.name}`);
      } catch (failure) {
        errors.push(failure instanceof Error ? failure.message : String(failure));
        setStatus(`${file.name} was not uploaded`);
      } finally {
        setPending((current) => current.filter((item) => item.key !== key));
      }
    }
    if (errors.length > 0) {
      setUploadError(errors.join('. '));
    }
  };

  const remove = (id: number) => {
    const next = ids.filter((existing) => existing !== id);
    onChange({ Files: next });
    setStatus(`Removed ${fileName(known[id], id)}`);
    setUploadError(null);
    focusAfterRemove.current = true;
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (canUpload) {
      void upload(Array.from(event.dataTransfer.files));
    }
  };

  return (
    <FieldHolder field={field} error={shownError} labelId={labelId}>
      <Stack
        spacing="sm"
        className="upload-field"
        id={field.id}
        ref={group}
        role="group"
        tabIndex={-1}
        aria-labelledby={labelId}
        aria-describedby={describedBy(field, shownError)}
        aria-busy={busy || undefined}
      >
        {(ids.length > 0 || busy) && (
          <Stack as="ul" spacing="sm" className="upload-field__files">
            {ids.map((id) => {
              const file = known[id];
              const name = fileName(file, id);
              const thumbnail = file?.smallThumbnail || (file?.category === 'image' ? file?.thumbnail : undefined);
              return (
                <li className="upload-field__file" key={id}>
                  {thumbnail ? (
                    <img className="upload-field__thumbnail" src={thumbnail} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="upload-field__thumbnail" />
                  )}
                  <Stack as="span" spacing="xs" className="upload-field__details">
                    <span className="upload-field__name">{name}</span>
                    <span className="upload-field__meta">{file?.exists === false ? 'File cannot be found' : fileMeta(file ?? {})}</span>
                  </Stack>
                  <span className="upload-field__actions">
                    <a className="upload-field__action" href={fileEditUrl(id)} target="_blank" rel="noopener noreferrer">
                      <PreviewIcon label={`Open ${name} in files (opens in new window)`} />
                    </a>
                    {editable && (
                      <button className="upload-field__action" type="button" onClick={() => remove(id)}>
                        <RemoveIcon label={`Remove ${name}`} />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
            {pending.map((item) => (
              <li className="upload-field__file" key={item.key}>
                <span className="upload-field__thumbnail" />
                <Stack as="span" spacing="xs" className="upload-field__details">
                  <span className="upload-field__name">{item.name}</span>
                  <progress className="upload-field__progress" value={item.progress} max={1} aria-label={`Uploading ${item.name}`} />
                </Stack>
              </li>
            ))}
          </Stack>
        )}
        {canUpload && (
          <Stack
            direction="row"
            align="center"
            justify="center"
            spacing="xs"
            className={dragging ? 'upload-field__dropzone upload-field__dropzone--active' : 'upload-field__dropzone'}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <UploadIcon className="upload-field__dropzone-icon" />
            <button className="upload-field__upload" type="button" ref={uploadButton} onClick={() => input.current?.click()}>
              Upload new
            </button>
            <span>{multi ? 'or drop files here' : 'or drop a file here'}</span>
            <input
              ref={input}
              type="file"
              hidden
              multiple={multi}
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void upload(files);
              }}
            />
          </Stack>
        )}
        <p className="upload-field__status" role="status">
          {status}
        </p>
      </Stack>
    </FieldHolder>
  );
};

export default UploadField;
