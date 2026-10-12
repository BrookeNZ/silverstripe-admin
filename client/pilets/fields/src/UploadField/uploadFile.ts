/**
 * Posts one file to an UploadField's own `upload` action, as the legacy dropzone did: multipart with the
 * file under `Upload` and the CSRF token both as a field and as `X-SecurityID`. Uses XMLHttpRequest
 * because fetch reports no upload progress.
 *
 * The action answers 200 with `[file]` (AssetAdmin::getObjectFromData) or 400 with
 * `{message: {type, value}}`, the reason the upload was refused (extension, size)
 */
import { CSRF_HEADER } from '../legacy/Backend';

/** A file as asset-admin describes it; existing files carry the minimal set, uploads the full one */
export interface UploadedFile {
  id: number;
  title?: string;
  name?: string;
  extension?: string;
  size?: number;
  category?: string;
  exists?: boolean;
  smallThumbnail?: string;
  thumbnail?: string;
  url?: string;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

function errorMessage(request: XMLHttpRequest): string {
  try {
    const body = JSON.parse(request.responseText);
    if (typeof body?.message?.value === 'string' && body.message.value !== '') {
      return body.message.value;
    }
  } catch {
    // Not JSON: fall through to the status
  }
  return request.status === 0 ? 'The upload could not reach the server' : `The upload failed (${request.status})`;
}

export function uploadFile(
  endpoint: string,
  file: File,
  securityId: string,
  onProgress: (fraction: number) => void,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('Upload', file);
    body.append('SecurityID', securityId);

    request.open('POST', new URL(endpoint, document.baseURI).href);
    request.withCredentials = true;
    request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader(CSRF_HEADER, securityId);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onerror = () => reject(new UploadError(errorMessage(request)));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new UploadError(errorMessage(request)));
        return;
      }
      try {
        const [uploaded] = JSON.parse(request.responseText) as Array<UploadedFile>;
        if (!uploaded || typeof uploaded.id !== 'number') {
          throw new Error('no file');
        }
        resolve(uploaded);
      } catch {
        reject(new UploadError('The server did not describe the uploaded file'));
      }
    };
    request.send(body);
  });
}

/** "PNG, 73 B" from the extension and byte size, as the design's meta line */
export function fileMeta(file: Pick<UploadedFile, 'extension' | 'size'>): string {
  const parts: Array<string> = [];
  if (file.extension) {
    parts.push(file.extension.toUpperCase());
  }
  if (typeof file.size === 'number') {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = file.size;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    parts.push(`${unit === 0 ? size : size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`);
  }
  return parts.join(', ');
}
