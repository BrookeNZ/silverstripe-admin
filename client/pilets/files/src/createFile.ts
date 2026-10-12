/**
 * Uploads a new file into a folder through AssetAdmin's `api/createFile`, as legacy's gallery dropzone did:
 * multipart with the file under `Upload`, the folder under `ParentID` and the CSRF token as the `SecurityID`
 * field, which is where `apiCreateFile` checks it (the `X-SecurityID` header goes too, for the shell's own
 * checks). XMLHttpRequest rather than fetch, because fetch reports no upload progress.
 *
 * The endpoint answers 200 with `[file]` (AssetAdmin::getObjectFromData), or the admin's error envelope
 * `{status: 'error', errors: [{code, value}]}`: 400 for a missing token or a file the upload validator refuses,
 * 403 when the member cannot create files.
 *
 * Before posting, `checkUpload` applies the section's `dropzoneOptions` as legacy's Dropzone library did: a
 * size limit in whole megabytes and a list of accepted extensions or MIME types. The server checks again.
 */

/** The section config's `dropzoneOptions` (AssetAdmin::getClientConfig) */
export interface UploadRules {
  /** Megabytes, floored by the server; 0 or absent sets no limit here */
  maxFilesize?: number;
  filesizeBase?: number;
  /** Comma separated `.ext` and MIME patterns; empty accepts anything */
  acceptedFiles?: string;
}

export interface CreatedFile {
  id: number;
  title: string;
}

export class UploadError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

export const refusedTypeMessage = "You can't upload files of this type.";

function accepts(file: File, acceptedFiles: string): boolean {
  const patterns = acceptedFiles
    .split(',')
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) {
      return name.endsWith(pattern);
    }
    if (pattern.endsWith('/*')) {
      return type.startsWith(pattern.slice(0, -1));
    }
    return type === pattern;
  });
}

/** Why the file cannot be uploaded, in legacy's AssetAdmin.DROPZONE_* words, or null when it may be posted */
export function checkUpload(file: File, rules: UploadRules): string | null {
  const base = rules.filesizeBase || 1024;
  const limit = rules.maxFilesize && rules.maxFilesize > 0 ? rules.maxFilesize * base * base : null;
  if (limit !== null && file.size > limit) {
    return `File is too big. Max filesize: ${rules.maxFilesize}MiB.`;
  }
  if (!accepts(file, rules.acceptedFiles ?? '')) {
    return refusedTypeMessage;
  }
  return null;
}

function errorMessage(request: XMLHttpRequest): string {
  try {
    const body = JSON.parse(request.responseText);
    const value = body?.errors?.[0]?.value ?? body?.message?.value;
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  } catch {
    // Not JSON: fall back to the status
  }
  return request.status === 0 ? 'The upload could not reach the server' : `The upload failed (${request.status})`;
}

export interface CreateFileOptions {
  endpoint: string;
  file: File;
  folderId: number;
  securityId: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function createFile({ endpoint, file, folderId, securityId, onProgress, signal }: CreateFileOptions): Promise<CreatedFile> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The upload was cancelled', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('Upload', file);
    body.append('ParentID', String(folderId));
    body.append('SecurityID', securityId);

    request.open('POST', new URL(endpoint, document.baseURI).href);
    request.withCredentials = true;
    request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('X-SecurityID', securityId);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.onabort = () => reject(new DOMException('The upload was cancelled', 'AbortError'));
    request.onerror = () => reject(new UploadError(errorMessage(request), request.status));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new UploadError(errorMessage(request), request.status));
        return;
      }
      try {
        const [created] = JSON.parse(request.responseText) as Array<{ id?: unknown; title?: unknown; name?: unknown }>;
        if (!created || typeof created.id !== 'number') {
          throw new Error('no file');
        }
        resolve({ id: created.id, title: String(created.title || created.name || file.name) });
      } catch {
        reject(new UploadError('The server did not describe the uploaded file', request.status));
      }
    };
    request.send(body);
  });
}
