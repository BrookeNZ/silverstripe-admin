import type { PiletApi } from '@silverstripe/admin-shell';
import { createElementalApi } from './api';
import { blockEditRoute, createBlockEditPage } from './BlockEditPage';
import type { ElementType } from './blocks';
import { createElementalAreaField } from './ElementalArea';
import { TextCheckboxGroupField } from './TextCheckboxGroupField';
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

export function setup(api: PiletApi) {
  // Block forms also open outside the area, in the archive section's block records
  api.registerSilverstripeComponent('TextCheckboxGroupField', TextCheckboxGroupField);
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
      api,
      client: createElementalApi(controllerUrl, api.fetchJson),
      types: section.elementTypes ?? [],
      schemaUrl: (id) => new URL(`${schemaUrl}${id}`, document.baseURI).href,
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
        api,
        types: section.elementTypes ?? [],
        pageClass: siteTree,
        routePrefix,
        editSectionUrl: new URL(editSection.url.replace(/\/$/, ''), document.baseURI).href,
      }),
    );
  }
}
