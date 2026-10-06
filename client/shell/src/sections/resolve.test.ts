import { describe, expect, it } from 'vitest';
import { editFormSchemaUrl, menuSections, modelTabPath, piletOwnsSection, resolveSectionRoute } from './resolve';
import type { SilverstripeMenuItem, SilverstripeSection } from '../silverstripe';

const menuItem = (title: string, link: string): SilverstripeMenuItem => ({
  code: title,
  title,
  link,
  iconClass: '',
  current: false,
});

const menu = [
  menuItem('Pages', 'admin/pages/'),
  menuItem('Security', 'admin/security/'),
  menuItem('Settings', 'admin/settings/'),
  menuItem('Help', 'https://userhelp.silverstripe.org/'),
];

const config: Array<SilverstripeSection> = [
  { name: 'CMSPageEditController', url: 'admin/pages/edit', reactRoutePath: 'pages/edit' },
  { name: 'CMSMain', url: 'admin/pages', reactRoutePath: 'pages' },
  {
    name: 'SecurityAdmin',
    url: 'admin/security',
    reactRoutePath: 'security',
    modelTabs: [
      { tab: 'users', title: 'Users' },
      { tab: 'groups', title: 'Groups' },
      { tab: 'roles', title: 'Roles' },
    ],
  },
  { name: 'SiteConfigLeftAndMain', url: 'admin/settings', reactRoutePath: 'settings' },
  { name: 'LeftAndMain', url: 'admin', reactRoutePath: '' },
];

const sections = menuSections(menu, config);

describe('menuSections', () => {
  it('keeps menu items that are admin sections, joined to their config by URL', () => {
    expect(sections.map((section) => [section.route, section.title, section.url])).toEqual([
      ['pages', 'Pages', 'admin/pages'],
      ['security', 'Security', 'admin/security'],
      ['settings', 'Settings', 'admin/settings'],
    ]);
    expect(sections[1].modelTabs.map((tab) => tab.tab)).toEqual(['users', 'groups', 'roles']);
    expect(sections[2].modelTabs).toEqual([]);
  });
});

describe('resolveSectionRoute', () => {
  it('resolves a plain section to its EditForm schema', () => {
    const route = resolveSectionRoute('/settings/', sections);
    expect(route?.section.title).toBe('Settings');
    expect(route?.tab).toBeNull();
    expect(route?.unhandled).toEqual([]);
    expect(route && editFormSchemaUrl(route)).toBe('admin/settings/schema/EditForm');
  });

  it('lands a ModelAdmin on its first model tab', () => {
    const route = resolveSectionRoute('/security', sections);
    expect(route?.tab?.tab).toBe('users');
    expect(route && editFormSchemaUrl(route)).toBe('admin/security/users/schema/EditForm');
  });

  it('reads the model tab from the segment after the section', () => {
    const route = resolveSectionRoute('/security/groups/', sections);
    expect(route?.tab?.title).toBe('Groups');
    expect(route?.unhandled).toEqual([]);
    expect(route && editFormSchemaUrl(route)).toBe('admin/security/groups/schema/EditForm');
    expect(route && route.tab && modelTabPath(route.section, route.tab)).toBe('/security/groups/');
  });

  it('reports deeper segments as unhandled, after the tab when there is one', () => {
    expect(resolveSectionRoute('/security/users/EditForm/field/users/item/3/edit', sections)?.unhandled).toEqual([
      'EditForm',
      'field',
      'users',
      'item',
      '3',
      'edit',
    ]);
    const untabbed = resolveSectionRoute('/security/EditForm/field/Members/item/3/edit', sections);
    expect(untabbed?.tab?.tab).toBe('users');
    expect(untabbed?.unhandled[0]).toBe('EditForm');
    expect(resolveSectionRoute('/settings/EditForm', sections)?.unhandled).toEqual(['EditForm']);
  });

  it('does not match a section by a prefix of its name or outside the menu', () => {
    expect(resolveSectionRoute('/securityx/', sections)).toBeNull();
    expect(resolveSectionRoute('/hello/', sections)).toBeNull();
    expect(resolveSectionRoute('/', sections)).toBeNull();
  });
});

describe('piletOwnsSection', () => {
  const [pages, security] = sections;

  it('leaves a section to a pilet that registered any page in it', () => {
    expect(piletOwnsSection(['/pages/*'], pages)).toBe(true);
    expect(piletOwnsSection(['pages/edit/show/:id'], pages)).toBe(true);
    expect(piletOwnsSection(['/pages'], pages)).toBe(true);
  });

  it('ignores pages in other sections or with a longer first segment', () => {
    expect(piletOwnsSection(['/assets/edit/:id', '/hello', '/pagesx/*'], pages)).toBe(false);
    expect(piletOwnsSection([], security)).toBe(false);
  });
});
