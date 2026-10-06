/**
 * Which CMS section a shell path belongs to, and which EditForm schema renders it.
 *
 * Sections are the CMS menu items, joined by URL to the section entries in `ss.config.sections` (which
 * carry `reactRoutePath`, the path under the admin root, and for a ModelAdmin its `modelTabs`). A
 * ModelAdmin's form is per model tab, so its schema URL is `<section url>/<tab>/schema/EditForm`; the
 * landing tab is the first one, as in ModelAdmin::init().
 */
import type { SectionHeader } from '../header/state';
import type { SilverstripeMenuItem, SilverstripeSection } from '../silverstripe';

export interface ModelTab {
  tab: string;
  title: string;
}

export interface ShellSection {
  /** The section's path under the admin root, without slashes: `security`, `pages` */
  route: string;
  title: string;
  /** The section controller's URL relative to the site base: `admin/security` */
  url: string;
  modelTabs: Array<ModelTab>;
}

export interface SectionRoute {
  section: ShellSection;
  /** The active model tab, for a ModelAdmin */
  tab: ModelTab | null;
  /** Whether the path names the tab, rather than landing on the first one */
  tabInPath: boolean;
  /** Path segments under the section (and tab) that the shell has no view for */
  unhandled: Array<string>;
}

const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

function isModelTabList(value: unknown): value is Array<ModelTab> {
  return Array.isArray(value) && value.every((item) => typeof item?.tab === 'string' && typeof item?.title === 'string');
}

export function menuSections(menu: Array<SilverstripeMenuItem>, sections: ReadonlyArray<SilverstripeSection>): Array<ShellSection> {
  return menu.flatMap((item) => {
    const link = trimSlashes(item.link);
    const config = sections.find((section) => trimSlashes(section.url) === link);
    if (!config || typeof config.reactRoutePath !== 'string' || !config.reactRoutePath) {
      return [];
    }
    return [
      {
        route: trimSlashes(config.reactRoutePath),
        title: item.title,
        url: link,
        modelTabs: isModelTabList(config.modelTabs) ? config.modelTabs : [],
      },
    ];
  });
}

function segmentsOf(path: string): Array<string> {
  return trimSlashes(path).split('/').filter(Boolean);
}

/** The section whose route is the longest leading match of the path, with its model tab and leftover segments */
export function resolveSectionRoute(pathname: string, sections: ReadonlyArray<ShellSection>): SectionRoute | null {
  const segments = segmentsOf(pathname);
  let best: ShellSection | null = null;
  for (const section of sections) {
    const route = segmentsOf(section.route);
    const matches = route.length > 0 && route.every((segment, index) => segments[index] === segment);
    if (matches && (!best || route.length > segmentsOf(best.route).length)) {
      best = section;
    }
  }
  if (!best) {
    return null;
  }

  const rest = segments.slice(segmentsOf(best.route).length);
  if (best.modelTabs.length === 0) {
    return { section: best, tab: null, tabInPath: false, unhandled: rest };
  }
  const named = best.modelTabs.find((tab) => tab.tab === rest[0]);
  return named
    ? { section: best, tab: named, tabInPath: true, unhandled: rest.slice(1) }
    : { section: best, tab: best.modelTabs[0], tabInPath: false, unhandled: rest };
}

export function editFormSchemaUrl({ section, tab }: Pick<SectionRoute, 'section' | 'tab'>): string {
  return [section.url, tab?.tab, 'schema/EditForm'].filter(Boolean).join('/');
}

export function modelTabPath(section: ShellSection, tab: ModelTab): string {
  return `/${section.route}/${tab.tab}/`;
}

/**
 * The section header for a route: the section title, the model tabs as views when there is more than
 * one, and a back button only below the section's landing view: to the tab from a path under it, or
 * to the section from a named tab
 */
export function sectionHeader({ section, tab, tabInPath, unhandled }: SectionRoute): SectionHeader {
  const sectionPath = `/${section.route}/`;
  let back: Pick<SectionHeader, 'backTo' | 'backLabel'> = {};
  if (unhandled.length > 0 && tab && tabInPath) {
    back = { backTo: modelTabPath(section, tab), backLabel: `Back to ${tab.title}` };
  } else if (unhandled.length > 0 || tabInPath) {
    back = { backTo: sectionPath, backLabel: `Back to ${section.title}` };
  }
  const views =
    section.modelTabs.length > 1
      ? section.modelTabs.map((item) => ({
          key: item.tab,
          label: item.title,
          to: modelTabPath(section, item),
          current: item.tab === tab?.tab,
        }))
      : undefined;
  return { title: section.title, ...back, ...(views ? { views } : {}) };
}

/** Whether a page a pilet registered sits in the section, which leaves the section to that pilet */
export function piletOwnsSection(pagePaths: Iterable<string>, section: ShellSection): boolean {
  const prefix = `/${section.route}`;
  for (const path of pagePaths) {
    const normalised = `/${trimSlashes(path)}`;
    if (normalised === prefix || normalised.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}
