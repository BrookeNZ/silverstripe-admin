import { describe, expect, it } from 'vitest';
import { pageAncestors, pageSectionHeader, parsePageTail } from './PagesSection';

describe('pageSectionHeader', () => {
  it('titles the index with the section and no back button or views', () => {
    expect(pageSectionHeader('/pages', null)).toEqual({ title: 'Pages' });
  });

  it('titles a page, goes back to the index and marks the open view current', () => {
    const header = pageSectionHeader('/pages', { id: 1, title: 'Home', view: 'edit' });
    expect([header.title, header.backTo, header.backLabel]).toEqual(['Home', '/pages/', 'Back to pages']);
    expect(header.views?.map((view) => [view.label, view.to, view.current])).toEqual([
      ['Content', '/pages/edit/show/1', true],
      ['Settings', '/pages/settings/show/1', false],
      ['History', '/pages/history/show/1', false],
    ]);
  });

  it('leaves back to the nearest ancestor when the page has one', () => {
    const header = pageSectionHeader('/pages', {
      id: 5, title: 'Team', view: 'edit', ancestors: [{ id: 2, title: 'About' }],
    });
    expect(header.crumbs).toEqual([{ label: 'About', to: '/pages/edit/show/2' }]);
    expect([header.backTo, header.backLabel]).toEqual([undefined, undefined]);
  });

  it('falls back to the page id until the tree has the page', () => {
    const header = pageSectionHeader('/pages', { id: 7, title: undefined, view: 'history' });
    expect(header.title).toBe('Page 7');
    expect(header.views?.find((view) => view.current)?.key).toBe('history');
  });

  it('lists only the views the site has', () => {
    const header = pageSectionHeader('/pages', { id: 1, title: 'Home', view: 'settings' }, ['edit', 'settings']);
    expect(header.views?.map((view) => view.label)).toEqual(['Content', 'Settings']);
  });
});

describe('parsePageTail', () => {
  const all = ['edit', 'settings', 'history'] as const;

  it('reads the view and page from a legacy tail, with or without the trailing slash', () => {
    expect(parsePageTail('edit/show/1', all)).toEqual({ view: 'edit', id: 1 });
    expect(parsePageTail('settings/show/22/', all)).toEqual({ view: 'settings', id: 22 });
    expect(parsePageTail('history/show/3', all)).toEqual({ view: 'history', id: 3 });
  });

  it('ignores other tails and views the site lacks', () => {
    expect(parsePageTail('', all)).toBeNull();
    expect(parsePageTail('edit/show/new', all)).toBeNull();
    expect(parsePageTail('edit/show/0', all)).toBeNull();
    expect(parsePageTail('edit/show/012', all)).toBeNull();
    expect(parsePageTail('edit/show/99999999999999999999', all)).toBeNull();
    expect(parsePageTail('history/show/3', ['edit', 'settings'])).toBeNull();
  });
});

describe('pageAncestors', () => {
  const nodes = new Map([
    [1, { id: 1, parentId: 0, title: 'About us' }],
    [2, { id: 2, parentId: 1, title: 'Team' }],
    [3, { id: 3, parentId: 2, title: 'Careers' }],
    [9, { id: 9, parentId: 8, title: 'Deep link' }],
  ]);
  const store = { node: (id: number) => nodes.get(id) as never };

  it('lists the loaded ancestors root first and draws them as crumbs to the content view', () => {
    const ancestors = pageAncestors(store, 3);
    expect(ancestors).toEqual([
      { id: 1, title: 'About us' },
      { id: 2, title: 'Team' },
    ]);
    expect(pageSectionHeader('/pages', { id: 3, title: 'Careers', view: 'settings', ancestors }).crumbs).toEqual([
      { label: 'About us', to: '/pages/edit/show/1' },
      { label: 'Team', to: '/pages/edit/show/2' },
    ]);
  });

  it('has none for a top-level page or one whose parent the tree has not loaded', () => {
    expect(pageAncestors(store, 1)).toEqual([]);
    expect(pageAncestors(store, 9)).toEqual([]);
    expect(pageSectionHeader('/pages', { id: 1, title: 'About us', view: 'edit', ancestors: [] })).not.toHaveProperty('crumbs');
  });
});
