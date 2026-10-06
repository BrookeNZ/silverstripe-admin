import type { PiletApi } from '@silverstripe/admin-shell';
import { createPagesSection } from './PagesSection';
import './pages.css';

const cmsMain = 'SilverStripe\\CMS\\Controllers\\CMSMain';
const cmsPageEdit = 'SilverStripe\\CMS\\Controllers\\CMSPageEditController';
const siteTree = 'SilverStripe\\CMS\\Model\\SiteTree';

export function setup(api: PiletApi) {
  const config = api.getConfig();
  const section = config.sections.find((candidate) => candidate.name === cmsMain);
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
      loginUrl: adminUrl.href,
      schemaUrl: (id) => `${editSection.url}/schema/EditForm/${id}`,
    }),
  );
}
