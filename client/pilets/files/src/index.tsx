import type { PiletApi } from '@silverstripe/admin-shell';
import { createFileRedirect } from './FileRedirect';
import { createFilesSection } from './FilesSection';
import type { UploadRules } from './createFile';
import './files.css';

const assetAdmin = 'SilverStripe\\AssetAdmin\\Controller\\AssetAdmin';

interface AssetAdminSection {
  reactRoutePath?: string;
  endpoints?: { read?: { url?: string }; createFile?: { url?: string } };
  dropzoneOptions?: UploadRules;
  form?: { fileEditForm?: { schemaUrl?: string }; folderCreateForm?: { schemaUrl?: string } };
}

/**
 * Routes under AssetAdmin's own `reactRoutePath`, reading the `read` endpoint and the `fileEditForm` schema URL
 * from its client config, where legacy read them too; without silverstripe/asset-admin the section is absent and
 * nothing registers. `edit/<id>`, the shell's former file edit page, redirects to the file in its folder
 */
export function setup(api: PiletApi) {
  const section = api.getConfig().sections.find((candidate) => candidate.name === assetAdmin) as AssetAdminSection | undefined;
  const readUrl = section?.endpoints?.read?.url;
  if (!section?.reactRoutePath || !readUrl) {
    return;
  }
  const routePrefix = `/${section.reactRoutePath.replace(/^\/+|\/+$/g, '')}`;
  const sectionTitle = 'Files';
  const fileEditSchemaUrl = section.form?.fileEditForm?.schemaUrl;
  const createFileUrl = section.endpoints?.createFile?.url;
  const Page = createFilesSection({
    routePrefix,
    sectionTitle,
    readEndpoint: new URL(readUrl, document.baseURI).href,
    fileEditSchemaUrl,
    createFileEndpoint: createFileUrl ? new URL(createFileUrl, document.baseURI).href : undefined,
    uploadRules: section.dropzoneOptions,
    folderCreateSchemaUrl: section.form?.folderCreateForm?.schemaUrl,
  });
  api.registerPage(routePrefix, Page);
  api.registerPage(`${routePrefix}/show/:folderId`, Page);
  api.registerPage(`${routePrefix}/show/:folderId/edit/:fileId`, Page);
  if (fileEditSchemaUrl) {
    api.registerPage(`${routePrefix}/edit/:id`, createFileRedirect({ routePrefix, sectionTitle, schemaUrl: fileEditSchemaUrl }));
  }
}
