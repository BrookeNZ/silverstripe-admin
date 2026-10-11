/**
 * The Files section: one folder's contents, a page at a time, as a gallery of tiles or a list, under a toolbar
 * and a section header whose breadcrumb is the folder's ancestors with "Files" as the root. The root folder is
 * `/` and every other folder `show/<id>`; the view, sort and page live in the query (see paths.ts), so each is a
 * link, and moving between folders keeps the view and sort.
 *
 * `show/<folderId>/edit/<fileId>` is the same page with the file open in the shell's details panel (FileDetails.tsx)
 * and its tile or row marked active. The listing is a cached server read keyed under File, so a file saved from
 * the panel's form (which announces its record) refetches the folder page showing it.
 */
import * as React from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PageComponentProps, PiletApi, SectionHeader } from '@silverstripe/admin-shell';
import { Link, Stack } from '@silverstripe/admin-patterns';
import type { LinkRenderProps } from '@silverstripe/admin-patterns';
import { AddFolder } from './AddFolder';
import type { AddFolderPiral } from './AddFolder';
import { folderKey, folderRecords, readFolder } from './api';
import type { FileItem, FolderListing } from './api';
import { FileDetailsPanel } from './FileDetails';
import type { DetailsPiral } from './FileDetails';
import { FileTable } from './FileTable';
import { emptyFolderText, Gallery } from './Gallery';
import { fileEditPath, folderPath, readFileRoute, readFolderQuery } from './paths';
import type { FolderQuery } from './paths';
import { Toolbar } from './Toolbar';
import type { UploadRules } from './createFile';
import { UploadDropZone, useFolderUploads } from './Uploads';
import type { UploadPiral } from './Uploads';

export interface FilesSectionOptions {
  /** `/` and the section's `reactRoutePath`: `/assets` */
  routePrefix: string;
  sectionTitle: string;
  /** The absolute URL of the section's `api/read/` endpoint */
  readEndpoint: string;
  /** The section's `fileEditForm` schema URL, which takes the file id; without it a file route shows the folder only */
  fileEditSchemaUrl?: string;
  /** The absolute URL of the section's `api/createFile` endpoint; without it Upload is disabled */
  createFileEndpoint?: string;
  /** The section's `dropzoneOptions` */
  uploadRules?: UploadRules;
  /** The section's `folderCreateForm` schema URL, which takes the parent folder's id; without it Add a folder is disabled */
  folderCreateSchemaUrl?: string;
}

// Only the class and label: the package's own ref and anchor props are typed against its separate React types
const routerLink = ({ href, className, children }: LinkRenderProps) => (
  <RouterLink className={className} to={href}>
    {children}
  </RouterLink>
);

/** What a link to another folder keeps: the view and sort, starting again at its first page */
type FolderLinkQuery = Pick<FolderQuery, 'view' | 'sort'>;

/** The root, then each ancestor down to the parent; the root folder itself has none */
export function folderCrumbs(listing: FolderListing, options: FilesSectionOptions, query: Partial<FolderLinkQuery> = {}): SectionHeader['crumbs'] {
  if (listing.id === 0) {
    return undefined;
  }
  return [
    { label: options.sectionTitle, to: folderPath(options.routePrefix, 0, query) },
    ...listing.ancestors.map((ancestor) => ({ label: ancestor.title, to: folderPath(options.routePrefix, ancestor.id, query) })),
  ];
}

export function filesSectionHeader(
  folderId: number,
  listing: FolderListing | undefined,
  options: FilesSectionOptions,
  query: Partial<FolderLinkQuery> = {},
): SectionHeader {
  if (folderId === 0) {
    return { title: options.sectionTitle };
  }
  if (!listing || listing.id !== folderId) {
    return { title: options.sectionTitle, crumbs: [{ label: options.sectionTitle, to: folderPath(options.routePrefix, 0, query) }] };
  }
  return { title: listing.title || options.sectionTitle, crumbs: folderCrumbs(listing, options, query) };
}

interface PagerProps {
  listing: FolderListing;
  routePrefix: string;
  query: FolderLinkQuery;
}

const Pager = ({ listing, routePrefix, query }: PagerProps) => (
  <Stack as="nav" className="files__inset" aria-label="Pages of this folder" direction="row" align="center" spacing="md">
    {listing.page > 1 && (
      <Link href={folderPath(routePrefix, listing.id, { ...query, page: listing.page - 1 })} renderLink={routerLink}>
        Previous
      </Link>
    )}
    <span>
      Page {listing.page} of {listing.pageCount}
    </span>
    {listing.page < listing.pageCount && (
      <Link href={folderPath(routePrefix, listing.id, { ...query, page: listing.page + 1 })} renderLink={routerLink}>
        Next
      </Link>
    )}
  </Stack>
);

type FilesPiral = Pick<PiletApi, 'setSectionHeader' | 'useServerQuery'> & DetailsPiral & AddFolderPiral & UploadPiral;

// Opening or closing a file remounts the page, so the listing is trusted this long; a records-changed event still refetches it at once
export const folderStaleTime = 30_000;

export function createFilesSection(options: FilesSectionOptions) {
  const FilesPage = ({ piral }: { piral: FilesPiral }) => {
    const params = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const { folderId, fileId } = readFileRoute(params);
    const { view, sort, page } = readFolderQuery(search);
    const linkQuery: FolderLinkQuery = { view, sort };
    const result = piral.useServerQuery(
      folderKey(folderId, page, sort),
      ({ request, signal }) => readFolder(request, options.readEndpoint, folderId, page, sort, signal),
      { keepPrevious: true, records: folderRecords, staleTime: folderStaleTime },
    );
    const listing = result.data;
    const header = filesSectionHeader(folderId, listing, options, linkQuery);
    const headerKey = JSON.stringify(header);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headerKey stands in for header, a new object every render
    React.useEffect(() => piral.setSectionHeader(header), [piral, headerKey]);

    const showing = listing && listing.id === folderId && listing.requestedPage === page ? listing : undefined;
    const DataTable = piral.getSilverstripeComponent('DataTable');
    const childFolderPath = (id: number) => folderPath(options.routePrefix, id, linkQuery);
    const filePath = (id: number) => fileEditPath(options.routePrefix, folderId, id, { view, sort, page });
    const itemPath = (item: FileItem) => (item.type === 'folder' ? childFolderPath(item.id) : filePath(item.id));
    // The view toggle and a new sort keep an open file open
    const samePage = (query: Partial<FolderQuery>) =>
      fileId === null ? folderPath(options.routePrefix, folderId, query) : fileEditPath(options.routePrefix, folderId, fileId, query);
    // A new sort starts again at the first page
    const sortBy = (next: FolderQuery['sort']) => navigate(samePage({ view, sort: next }));
    const shownPage = showing?.page;
    // A page past the end shows the last page, and the URL follows so its links and the pager agree
    React.useEffect(() => {
      if (shownPage !== undefined && shownPage !== page) {
        navigate(samePage({ view, sort, page: shownPage }), { replace: true });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- samePage is rebuilt every render from the route values listed
    }, [shownPage, page, view, sort, fileId, folderId, navigate]);
    const upload = useFolderUploads({
      piral,
      endpoint: options.createFileEndpoint,
      rules: options.uploadRules ?? {},
      folderId,
      fileId,
      canEdit: showing !== undefined && showing.canEdit !== false,
      listedIds: showing ? folderRecords(showing) : null,
      listingKey: `${folderId}:${sort}:${page}`,
      openFile: (id) => navigate(filePath(id)),
    });

    return (
      <div className="files">
        <Toolbar
          view={view}
          sort={sort}
          otherViewPath={samePage({ view: view === 'gallery' ? 'list' : 'gallery', sort, page })}
          onSort={sortBy}
          onUpload={upload.openPicker}
          uploadRef={upload.uploadRef}
          addFolder={
            options.folderCreateSchemaUrl ? (
              <AddFolder
                piral={piral}
                schemaUrl={options.folderCreateSchemaUrl}
                folderId={folderId}
                disabled={showing?.canEdit === false}
                folderPath={childFolderPath}
              />
            ) : undefined
          }
        />
        {upload.picker}
        <UploadDropZone enabled={upload.enabled} onFiles={upload.addFiles}>
          <Stack className="files__body" spacing="md">
            {result.status === 'error' && !showing && (
              <p className="admin-error-text files__inset" role="alert">
                {result.error instanceof Error ? result.error.message : 'The folder could not be loaded.'}
              </p>
            )}
            {!showing && result.status !== 'error' && (
              <p className="files__message files__inset" role="status">
                Loading files…
              </p>
            )}
            {showing && view === 'gallery' && (
              <Gallery
                items={showing.items}
                folderPath={childFolderPath}
                filePath={filePath}
                activeId={fileId}
                uploads={upload.uploads}
                uploadActions={upload.actions}
              />
            )}
            {showing && view === 'list' && showing.items.length + upload.uploads.length === 0 && <p className="files__message files__inset">{emptyFolderText}</p>}
            {showing && view === 'list' && showing.items.length + upload.uploads.length > 0 && (
              <FileTable
                items={showing.items}
                sort={sort}
                onSort={sortBy}
                itemPath={itemPath}
                onOpen={navigate}
                Table={DataTable}
                activeId={fileId}
                uploads={upload.uploads}
                uploadActions={upload.actions}
              />
            )}
            {showing && showing.pageCount > 1 && <Pager listing={showing} routePrefix={options.routePrefix} query={linkQuery} />}
          </Stack>
        </UploadDropZone>
        {fileId !== null && options.fileEditSchemaUrl && (
          <FileDetailsPanel
            piral={piral}
            fileId={fileId}
            schemaUrl={options.fileEditSchemaUrl}
            item={showing?.items.find((item) => item.id === fileId)}
            closePath={folderPath(options.routePrefix, folderId, { view, sort, page })}
          />
        )}
      </div>
    );
  };

  return ({ piral }: PageComponentProps) => <FilesPage piral={piral} />;
}
