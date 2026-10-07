import type { PiletApi } from '@silverstripe/admin-shell';
import { createPagesSection } from './PagesSection';
import './pages.css';

const cmsMain = 'SilverStripe\\CMS\\Controllers\\CMSMain';
const cmsPageEdit = 'SilverStripe\\CMS\\Controllers\\CMSPageEditController';
const cmsPageSettings = 'SilverStripe\\CMS\\Controllers\\CMSPageSettingsController';
const cmsPageHistory = 'SilverStripe\\VersionedAdmin\\Controllers\\CMSPageHistoryViewerController';
const siteTree = 'SilverStripe\\CMS\\Model\\SiteTree';

function editFormSchemaUrl(sectionUrl: string | undefined): ((id: number) => string) | undefined {
  return sectionUrl ? (id) => `${sectionUrl}/schema/EditForm/${id}` : undefined;
}

export function setup(api: PiletApi) {
  const config = api.getConfig();
  const section = config.sections.find((candidate) => candidate.name === cmsMain);
  const sectionUrl = (name: string) => config.sections.find((candidate) => candidate.name === name)?.url;
  const editSection = config.sections.find((candidate) => candidate.name === cmsPageEdit);
  if (!section?.reactRoutePath || !editSection) {
    return;
  }
  const adminUrl = new URL(config.adminUrl, document.baseURI);
  const routePrefix = `/${section.reactRoutePath}`;
  api.registerPage(
    `${routePrefix}/*`,
    createPagesSection({
      routePrefix,
      pageClass: siteTree,
      // The url_segment of PageTreeController in the admin module
      treeUrl: new URL(`${section.url}/tree/`, document.baseURI).href,
      // The url_segment of PageCreateController in the admin module
      createUrl: new URL(`${section.url}/create/`, document.baseURI).href,
      securityId: () => String(config.SecurityID ?? ''),
      loginUrl: adminUrl.href,
      schemaUrls: {
        edit: editFormSchemaUrl(editSection.url),
        settings: editFormSchemaUrl(sectionUrl(cmsPageSettings)),
        history: editFormSchemaUrl(sectionUrl(cmsPageHistory)),
      },
    }),
  );
}
