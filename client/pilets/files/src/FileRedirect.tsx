/**
 * `edit/<fileId>`, the shell's former full-page file edit route, now a redirect to the file in its folder:
 * the folder is the file's ParentID, read from its `fileEditForm` state, and the route is replaced so Back
 * skips it. A file that cannot be read shows the server's message under a "Files" header.
 */
import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { FormSchemaResponse, PiletApi } from '@silverstripe/admin-shell';
import { fileClass } from './api';
import { fileParentId } from './fileState';
import { fileEditPath, wholeNumber } from './paths';

export type RedirectPiral = Pick<PiletApi, 'useServerQuery' | 'setSectionHeader'>;

export interface FileRedirectOptions {
  routePrefix: string;
  sectionTitle: string;
  /** The section's `fileEditForm` schema URL, which takes the file id */
  schemaUrl: string;
}

export function fileStateKey(fileId: number) {
  return [fileClass, fileId, 'state'] as const;
}

export function createFileRedirect(options: FileRedirectOptions) {
  const FileRedirect = ({ piral }: { piral: RedirectPiral }) => {
    const fileId = wholeNumber(useParams().id, 1, 0);
    const result = piral.useServerQuery(
      fileStateKey(fileId),
      ({ request, signal }) =>
        request<FormSchemaResponse>(options.schemaUrl + encodeURIComponent(String(fileId)), {
          headers: { 'X-Formschema-Request': 'state' },
          query: { formSchema: 1 },
          signal,
        }),
    );
    React.useEffect(() => piral.setSectionHeader({ title: options.sectionTitle }), [piral]);
    const parentId = result.data?.state ? fileParentId(result.data.state) : null;

    if (parentId !== null) {
      return <Navigate replace to={fileEditPath(options.routePrefix, parentId, fileId)} />;
    }
    const failed = result.status === 'error' || (result.status === 'success' && parentId === null) || fileId === 0;
    return (
      <div className="files">
        <p className={failed ? 'files__alert files__inset' : 'files__message files__inset'} role={failed ? 'alert' : 'status'}>
          {failed ? (result.error instanceof Error ? result.error.message : 'The file could not be found.') : 'Opening the file…'}
        </p>
      </div>
    );
  };
  return FileRedirect;
}
