import { describe, expect, it } from 'vitest';
import { recordBackPath, recordHeader, recordRoute, recordSchemaUrl, sentenceCaseName } from './record';
import { resolveSectionRoute } from './resolve';
import type { ShellSection } from './resolve';

const model = 'SilverStripe-RedirectedURLs-Model-RedirectedURL';

const redirects: ShellSection = {
  route: 'redirects',
  title: 'Redirects',
  url: 'admin/redirects',
  modelTabs: [{ tab: model, title: 'Redirected URLs' }],
};

const settings: ShellSection = { route: 'settings', title: 'Settings', url: 'admin/settings', modelTabs: [] };

const route = (path: string) => {
  const section = resolveSectionRoute(path, [redirects, settings]);
  return section ? recordRoute(section) : null;
};

describe('recordRoute', () => {
  it('reads the legacy item URL with or without its action', () => {
    for (const tail of ['', '/', '/edit', '/edit/', '/view']) {
      const record = route(`/redirects/${model}/EditForm/field/${model}/item/49${tail}`);
      expect(record?.id).toBe(49);
      expect(record?.grid).toBe(model);
      expect(record?.itemUrl).toBe(`admin/redirects/${model}/EditForm/field/${model}/item/49`);
    }
  });

  it('reads a new record and names the landing tab when the URL leaves it out', () => {
    const record = route(`/redirects/EditForm/field/${model}/item/new/edit`);
    expect(record?.id).toBeNull();
    expect(record?.tab?.tab).toBe(model);
    expect(record && recordSchemaUrl(record)).toBe(`admin/redirects/${model}/EditForm/field/${model}/item/new/schema`);
  });

  it('serves a grid on a section without model tabs', () => {
    const record = route('/settings/EditForm/field/SocialLinks/item/1/edit');
    expect(record?.itemUrl).toBe('admin/settings/EditForm/field/SocialLinks/item/1');
    expect(record && recordBackPath(record)).toBe('/settings/');
  });

  it('leaves other paths to the section', () => {
    expect(route(`/redirects/${model}/`)).toBeNull();
    expect(route(`/redirects/${model}/EditForm/field/${model}/item/abc/edit`)).toBeNull();
    expect(route(`/redirects/${model}/EditForm/field/${model}/item/0/edit`)).toBeNull();
    expect(route(`/redirects/${model}/EditForm/field/${model}/item/4/delete`)).toBeNull();
    expect(route(`/redirects/${model}/EditForm/field/${model}/item/4/ItemEditForm/field/Other/item/2`)).toBeNull();
  });
});

describe('recordHeader', () => {
  const saved = route(`/redirects/${model}/EditForm/field/${model}/item/49/edit`)!;
  const fresh = route(`/redirects/${model}/EditForm/field/${model}/item/new/edit`)!;
  const summary = { id: 49, className: 'RedirectedURL', title: '#49', singularName: 'Redirected URL', link: 'x' };

  it('titles the record and goes back to its grid tab', () => {
    expect(recordHeader(saved, summary)).toEqual({
      title: '#49',
      backTo: `/redirects/${model}/`,
      backLabel: 'Back to redirected URLs',
    });
  });

  it('falls back before the record loads and names a new record by its type', () => {
    expect(recordHeader(saved, null).title).toBe('Redirected URLs #49');
    expect(recordHeader(fresh, null).title).toBe('New record');
    expect(recordHeader(fresh, { ...summary, id: null, title: null, link: null }).title).toBe('New redirected URL');
  });
});

describe('sentenceCaseName', () => {
  it('lowers title-cased words and keeps acronyms', () => {
    expect(sentenceCaseName('Site Banner')).toBe('site banner');
    expect(sentenceCaseName('Redirected URL')).toBe('redirected URL');
  });
});
