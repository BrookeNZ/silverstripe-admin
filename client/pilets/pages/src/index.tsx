import type { PiletApi } from '@silverstripe/admin-shell';
import { accessListFieldName, accessListSchema, createAccessListField } from './AccessListField';
import { createPagesSection } from './PagesSection';
import type { PagesSidebarSlotProps } from './PagesSidebar';
import {
  createSiteTreeURLSegmentField,
  siteTreeURLSegmentFieldClass,
  siteTreeURLSegmentFieldReadonlyClass,
} from './SiteTreeURLSegmentField';
import { createSiteTreeTitleField, siteTreeTitleFieldName, titleFieldSchema } from './SiteTreeTitleField';
import { createDraftTitleStore } from './draftTitle';
import { siteTreeClass } from './treeStore';
import './pages.css';

const cmsMain = 'SilverStripe\\CMS\\Controllers\\CMSMain';
const cmsPageEdit = 'SilverStripe\\CMS\\Controllers\\CMSPageEditController';
const cmsPageSettings = 'SilverStripe\\CMS\\Controllers\\CMSPageSettingsController';
const cmsPageHistory = 'SilverStripe\\VersionedAdmin\\Controllers\\CMSPageHistoryViewerController';

function editFormSchemaUrl(sectionUrl: string | undefined): ((id: number) => string) | undefined {
  return sectionUrl ? (id) => `${sectionUrl}/schema/EditForm/${id}` : undefined;
}

/**
 * Routes under CMSMain's own `reactRoutePath` so legacy page URLs land here; without silverstripe/cms
 * its sections are absent and nothing registers
 */
export function setup(api: PiletApi) {
  // Page forms also open in the archive and history sections. The read-only subclass is registered too,
  // since the Text type default would outrank its parent class in resolution
  const urlSegmentField = createSiteTreeURLSegmentField(api.fetchJson);
  api.registerSilverstripeComponent(siteTreeURLSegmentFieldClass, urlSegmentField);
  api.registerSilverstripeComponent(siteTreeURLSegmentFieldReadonlyClass, urlSegmentField);
  const draftTitle = createDraftTitleStore();
  api.registerSilverstripeComponent(
    siteTreeTitleFieldName,
    createSiteTreeTitleField({ request: api.fetchJson, useFormFieldValue: api.useFormFieldValue, draftTitle }),
  );
  api.registerHook('updateFormSchema', titleFieldSchema, { id: 'title-url-segment' });
  api.registerSilverstripeComponent(accessListFieldName, createAccessListField(api));
  api.registerHook('updateFormSchema', accessListSchema, { id: 'access-lists' });
  const config = api.getConfig();
  const section = config.sections.find((candidate) => candidate.name === cmsMain);
  const sectionUrl = (name: string) => config.sections.find((candidate) => candidate.name === name)?.url;
  const editSection = config.sections.find((candidate) => candidate.name === cmsPageEdit);
  if (!section?.reactRoutePath || !editSection) {
    return;
  }
  const adminUrl = new URL(config.adminUrl, document.baseURI);
  const routePrefix = `/${section.reactRoutePath}`;
  const sectionCode = cmsMain.replace(/\\/g, '-');
  const { Page, Sidebar } = createPagesSection({
    routePrefix,
    sectionCode,
    sectionTitle: 'Pages',
    pageClass: siteTreeClass,
    // The url_segment of PageTreeController in the admin module
    treeUrl: new URL(`${section.url}/tree/`, document.baseURI).href,
    // The url_segment of PageCreateController in the admin module
    createUrl: new URL(`${section.url}/create/`, document.baseURI).href,
    moveUrl: new URL(`${section.url}/move/`, document.baseURI).href,
    draftTitle,
    loginUrl: adminUrl.href,
    schemaUrls: {
      edit: editFormSchemaUrl(editSection.url),
      settings: editFormSchemaUrl(sectionUrl(cmsPageSettings)),
      history: editFormSchemaUrl(sectionUrl(cmsPageHistory)),
    },
  });
  api.registerPage(`${routePrefix}/*`, Page);
  api.registerSectionSidebar(sectionCode, (slot: PagesSidebarSlotProps) => <Sidebar piral={api} {...slot} />);
}
