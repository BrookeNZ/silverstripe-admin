import type { PiletApi } from '@silverstripe/admin-shell';
import { createElementalApi } from './api';
import { blockEditRoute, createBlockEditPage } from './BlockEditPage';
import type { ElementType } from './blocks';
import { createElementalAreaField } from './ElementalArea';
import type { ElementalPiletApi } from './shell';
import './elemental.css';

const areaController = 'DNADesign\\Elemental\\Controllers\\ElementalAreaController';
const areaField = 'DNADesign\\Elemental\\Forms\\ElementalAreaField';
const siteTree = 'SilverStripe\\CMS\\Model\\SiteTree';
const cmsMain = 'SilverStripe\\CMS\\Controllers\\CMSMain';
const cmsPageEdit = 'SilverStripe\\CMS\\Controllers\\CMSPageEditController';

interface AreaSection {
  url: string;
  elementTypes?: Array<ElementType>;
  form?: { elementForm?: { schemaUrl?: string } };
}

/** The router path for an admin URL (the router's basename is the admin URL), or null outside it */
export function adminRouterPath(url: string, adminUrl: string): string | null {
  const admin = new URL(adminUrl, document.baseURI);
  const target = new URL(url, document.baseURI);
  const base = admin.pathname.replace(/\/$/, '');
  if (target.origin !== admin.origin || !target.pathname.startsWith(`${base}/`)) {
    return null;
  }
  return target.pathname.slice(base.length) + target.search;
}

export function setup(api: PiletApi) {
  const config = api.getConfig();
  const section = config.sections.find((candidate) => candidate.name === areaController) as AreaSection | undefined;
  const schemaUrl = section?.form?.elementForm?.schemaUrl;
  if (!section || !schemaUrl) {
    return;
  }
  const controllerUrl = new URL(`${section.url.replace(/\/$/, '')}/`, document.baseURI).href;
  api.registerSilverstripeComponent(
    areaField,
    createElementalAreaField({
      api: api as ElementalPiletApi,
      client: createElementalApi(controllerUrl, String(config.SecurityID ?? '')),
      types: section.elementTypes ?? [],
      schemaUrl: (id) => new URL(`${schemaUrl}${id}`, document.baseURI).href,
      routerPath: (url) => adminRouterPath(url, config.adminUrl),
      pageClass: siteTree,
    }),
  );

  const pagesSection = config.sections.find((candidate) => candidate.name === cmsMain);
  const editSection = config.sections.find((candidate) => candidate.name === cmsPageEdit);
  if (pagesSection?.reactRoutePath && editSection) {
    const routePrefix = `/${pagesSection.reactRoutePath}`;
    api.registerPage(
      blockEditRoute(routePrefix),
      createBlockEditPage({
        api: api as ElementalPiletApi,
        types: section.elementTypes ?? [],
        pageClass: siteTree,
        routePrefix,
        editSectionUrl: new URL(editSection.url.replace(/\/$/, ''), document.baseURI).href,
      }),
    );
  }
}
