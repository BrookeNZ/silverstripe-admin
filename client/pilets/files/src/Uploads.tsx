/**
 * The upload queue drawn in the folder, where legacy drew it: each queued file a tile at the head of the
 * gallery's files, or a row at the head of the list's, with a progress bar while it posts, and its reason once
 * it fails. The Figma file draws no upload state, so the tile is the file tile with the document glyph, and
 * the reason and the progress bar take its preview area. One button per upload says what it does to which
 * file: "Cancel upload of <name>" while it waits or posts, "Remove <name>" once it failed.
 *
 * The drop zone wraps the folder's listing, as legacy's dropzone covered the gallery; while files are dragged
 * over it, it shows legacy's "Drop files here to upload". The toolbar's Upload button opens the same queue
 * through the browser's file picker, so dropping is never the only way in.
 *
 * `useFolderUploads` ties the queue to the page: a toast as a batch starts, one per failure (an error, which stays
 * until dismissed) and one when the batch is done; each upload refetches the folder. When a batch is done and no
 * file is open, the last file it uploaded opens in the details panel, as legacy did. Cancelling or removing an
 * upload takes its tile away, so focus goes to the Upload button.
 */
import * as React from 'react';
import type { DataTableRow, PiletApi } from '@silverstripe/admin-shell';
import { Button, CloseIcon } from '@silverstripe/admin-patterns';
import { fileClass } from './api';
import type { UploadRules } from './createFile';
import { addUploads, cancelUpload, dropListed, purgeFinished, removeUpload, useUploads } from './uploadQueue';
import type { QueuedUpload } from './uploadQueue';
// Figma "Image/doc file" Type=Document 2:6521, the 50px document glyph, as on the file tile
import documentIcon from './assets/document.svg';
// Figma "File list item" Type=PDF 2:6683, the 24px document glyph, as on the list row
import documentSmallIcon from './assets/document-small.svg';

export interface UploadActions {
  onCancel: (key: string) => void;
  onRemove: (key: string) => void;
}

// Legacy's AssetAdmin.DROPZONE_SUCCESS_UPLOAD
const uploadedText = 'File uploaded';

const UploadState = ({ upload }: { upload: QueuedUpload }) => {
  if (upload.status === 'failed') {
    return <span className="files-upload__error">{upload.message}</span>;
  }
  if (upload.status === 'done') {
    return <span>{uploadedText}</span>;
  }
  return (
    <progress
      className="files-upload__progress"
      max={100}
      value={Math.round(upload.progress * 100)}
      aria-label={upload.status === 'waiting' ? `Waiting to upload ${upload.name}` : `Uploading ${upload.name}`}
    />
  );
};

const UploadAction = ({ upload, onCancel, onRemove }: { upload: QueuedUpload } & UploadActions) => {
  if (upload.status === 'done') {
    return null;
  }
  const failed = upload.status === 'failed';
  return (
    <Button
      variant="tertiary"
      iconOnly
      icon={<CloseIcon />}
      className="files-upload__action"
      aria-label={failed ? `Remove ${upload.name}` : `Cancel upload of ${upload.name}`}
      onClick={() => (failed ? onRemove(upload.key) : onCancel(upload.key))}
    />
  );
};

export interface UploadTileProps extends UploadActions {
  upload: QueuedUpload;
}

export const UploadTile = ({ upload, onCancel, onRemove }: UploadTileProps) => (
  <li className={upload.status === 'failed' ? 'files-tile files-tile--file files-tile--failed' : 'files-tile files-tile--file'}>
    <span className="files-tile__preview">
      <img className="files-tile__type" src={documentIcon} alt="" />
      <span className="files-upload">
        <UploadState upload={upload} />
      </span>
    </span>
    <span className="files-tile__footer">
      <span className="files-tile__name">{upload.name}</span>
      <UploadAction upload={upload} onCancel={onCancel} onRemove={onRemove} />
    </span>
  </li>
);

/** "2.4 MB" from a byte count, for the list's Size column */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

/** The queue as list rows, keyed apart from the listing's numeric ids */
export function uploadRows(uploads: ReadonlyArray<QueuedUpload>, actions: UploadActions): Array<DataTableRow> {
  return uploads.map((upload) => ({
    id: upload.key,
    label: upload.name,
    cells: {
      title: (
        <span className="files-table__title">
          <span className="files-table__icon">
            <img src={documentSmallIcon} alt="" />
          </span>
          <span className="files-upload__name">{upload.name}</span>
          <UploadState upload={upload} />
          <UploadAction upload={upload} {...actions} />
        </span>
      ),
      size: formatBytes(upload.size),
      modified: '',
    },
  }));
}

export interface UploadDropZoneProps {
  enabled: boolean;
  onFiles: (files: Array<File>) => void;
  children: React.ReactNode;
}

const carriesFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

export const UploadDropZone = ({ enabled, onFiles, children }: UploadDropZoneProps) => {
  const [dragging, setDragging] = React.useState(false);
  // Enter and leave fire for every child crossed, so the zone counts them
  const depth = React.useRef(0);
  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };
  if (!enabled) {
    return <div className="files-dropzone">{children}</div>;
  }
  return (
    <div
      className={dragging ? 'files-dropzone files-dropzone--dragging' : 'files-dropzone'}
      onDragEnter={(event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
          depth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
        }
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) {
          return;
        }
        event.preventDefault();
        reset();
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) {
          onFiles(files);
        }
      }}
    >
      {children}
      {dragging && (
        // Legacy's AssetAdmin.DROPZONE_DEFAULT_MESSAGE; a pointer-only cue, as the Upload button is the way in
        <div className="files-dropzone__overlay" aria-hidden="true">
          <span className="files-dropzone__message">Drop files here to upload</span>
        </div>
      )}
    </div>
  );
};

export type UploadPiral = Pick<PiletApi, 'showNotification' | 'invalidateRecords'>;

export interface FolderUploadOptions {
  piral: UploadPiral;
  /** The section's `createFile` endpoint; without it nothing uploads */
  endpoint?: string;
  rules: UploadRules;
  folderId: number;
  /** The open file, or null */
  fileId: number | null;
  /** False when the member cannot add files to the folder */
  canEdit: boolean;
  /** The ids the folder's listing shows; null while it loads */
  listedIds: ReadonlyArray<number> | null;
  /** Changes with the folder, sort or page, which drops finished uploads */
  listingKey: string;
  openFile: (id: number) => void;
}

interface ActivePage {
  folderId: number;
  fileId: number | null;
  openFile: (id: number) => void;
}

// The page showing now, which a batch finishing after a remount reads instead of the page that started it
let activePage: ActivePage | null = null;

function countLabel(verb: string, names: ReadonlyArray<string>): string {
  return names.length === 1 ? `${verb} ${names[0]}` : `${verb} ${names.length} files`;
}

function liveSecurityId(): string {
  return String((window as { ss?: { config?: { SecurityID?: unknown } } }).ss?.config?.SecurityID ?? '');
}

export function useFolderUploads({ piral, endpoint, rules, folderId, fileId, canEdit, listedIds, listingKey, openFile }: FolderUploadOptions) {
  const uploads = useUploads(folderId);
  const input = React.useRef<HTMLInputElement>(null);
  const uploadRef = React.useRef<HTMLButtonElement>(null);
  const enabled = Boolean(endpoint) && canEdit;

  React.useEffect(() => {
    const current = { folderId, fileId, openFile };
    activePage = current;
    return () => {
      if (activePage === current) {
        activePage = null;
      }
    };
  });

  const listedKey = listedIds?.join(',') ?? null;
  React.useEffect(() => {
    if (listedIds) {
      dropListed(folderId, listedIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listedKey stands in for listedIds
  }, [folderId, listedKey]);

  const firstKey = React.useRef(listingKey);
  React.useEffect(() => {
    if (firstKey.current !== listingKey) {
      firstKey.current = listingKey;
      purgeFinished();
    }
  }, [listingKey]);

  const addFiles = (files: ReadonlyArray<File>) => {
    if (!endpoint || files.length === 0) {
      return;
    }
    const added = addUploads(files, {
      endpoint,
      folderId,
      rules,
      securityId: liveSecurityId,
      onSettled: (upload) => {
        if (upload.status === 'failed') {
          piral.showNotification(`${upload.name}: ${upload.message}`, { type: 'error' });
        }
        if (upload.status === 'done') {
          piral.invalidateRecords(fileClass, [upload.folderId]);
        }
      },
      onBatchDone: (batchFolderId, created) => {
        if (created.length === 0) {
          return;
        }
        piral.showNotification(countLabel('Uploaded', created.map((file) => file.title)), { type: 'success' });
        const showing = activePage;
        if (showing && showing.folderId === batchFolderId && showing.fileId === null) {
          showing.openFile(created[created.length - 1].id);
        }
      },
    });
    const accepted = added.filter((upload) => upload.status !== 'failed');
    if (accepted.length > 0) {
      piral.showNotification(countLabel('Uploading', accepted.map((upload) => upload.name)), { type: 'info' });
    }
  };

  const actions: UploadActions = {
    onCancel: (key) => {
      const upload = uploads.find((candidate) => candidate.key === key);
      cancelUpload(key);
      uploadRef.current?.focus();
      if (upload) {
        piral.showNotification(`Cancelled the upload of ${upload.name}`, { type: 'info' });
      }
    },
    onRemove: (key) => {
      removeUpload(key);
      uploadRef.current?.focus();
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      accept={rules.acceptedFiles || undefined}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        // Cleared so picking the same file again still changes it
        event.currentTarget.value = '';
        addFiles(files);
      }}
    />
  );

  return {
    uploads,
    actions,
    enabled,
    addFiles,
    picker,
    uploadRef,
    openPicker: enabled ? () => input.current?.click() : undefined,
  };
}
