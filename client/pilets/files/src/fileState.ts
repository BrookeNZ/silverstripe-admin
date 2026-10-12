/**
 * What the details panel shows about a file, read from its `fileEditForm` state: the title, the dimensions and
 * size from the form's FileSpecs literal (`<div class="editor__specs">1120x640px 13 KB </div>`, FileFormFactory),
 * and the preview from PreviewImageField's data. The form's own header group and preview field are left out of
 * the form, since the panel draws them, and both post nothing.
 */
import type { FormSchemaState } from '@silverstripe/admin-shell';

export const panelOmittedFields: ReadonlyArray<string> = ['AssetEditorHeaderFieldGroup', 'PreviewImage'];

export interface FileDetails {
  title: string | null;
  /** "1120 x 640px", then "13 KB", as many as the specs carry */
  meta: Array<string>;
  preview: FilePreview | null;
  parentId: number | null;
}

export interface FilePreview {
  /** The resized preview, cache-busted by the file version */
  src: string;
  /** The full file, cache-busted the same way */
  href: string;
  isImage: boolean;
  exists: boolean;
  filename: string;
}

interface PreviewData {
  url?: string;
  preview?: string;
  version?: number;
  exists?: boolean;
  category?: string;
  initialValues?: { FileFilename?: string };
}

function fieldOf(state: FormSchemaState, name: string) {
  return state.fields.find((field) => field.name === name);
}

/** The saved Title, or the file name when the title is blank */
export function fileTitle(state: FormSchemaState): string | null {
  for (const name of ['Title', 'Name']) {
    const value = fieldOf(state, name)?.value;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

/** "1120x640px 13 KB" as ["1120 x 640px", "13 KB"]; a file that is not an image has the size only */
export function fileSpecs(html: unknown): Array<string> {
  if (typeof html !== 'string') {
    return [];
  }
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const dimensions = text.match(/(\d+)\s*x\s*(\d+)\s*px/i);
  const size = (dimensions ? text.replace(dimensions[0], '') : text).trim();
  return [dimensions && `${dimensions[1]} x ${dimensions[2]}px`, size].filter((part): part is string => Boolean(part));
}

/** Appends the file version as `vid`, as legacy did, so a replaced file is not served from cache */
export function cacheBustUrl(url: string, version: number | undefined, base: string): string {
  if (!version || url.startsWith('data:')) {
    return url;
  }
  const busted = new URL(url, base);
  busted.searchParams.set('vid', String(version));
  return busted.href;
}

export function filePreview(state: FormSchemaState, base: string): FilePreview | null {
  const data = fieldOf(state, 'PreviewImage')?.data as PreviewData | undefined;
  if (!data || Array.isArray(data)) {
    return null;
  }
  const src = data.preview || data.url;
  if (!src) {
    return null;
  }
  return {
    src: cacheBustUrl(src, data.version, base),
    href: cacheBustUrl(data.url ?? src, data.version, base),
    isImage: !data.category || data.category === 'image',
    exists: data.exists !== false,
    filename: data.initialValues?.FileFilename ?? '',
  };
}

export function fileParentId(state: FormSchemaState): number | null {
  const value = Number(fieldOf(state, 'ParentID')?.value);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function fileDetails(state: FormSchemaState, base: string): FileDetails {
  return {
    title: fileTitle(state),
    meta: fileSpecs(fieldOf(state, 'FileSpecs')?.value),
    preview: filePreview(state, base),
    parentId: fileParentId(state),
  };
}
