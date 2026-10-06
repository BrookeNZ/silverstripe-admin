import { describe, expect, it } from 'vitest';
import { pageSectionHeader } from './PagesSection';

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

  it('falls back to the page id until the tree has the page', () => {
    const header = pageSectionHeader('/pages', { id: 7, title: undefined, view: 'history' });
    expect(header.title).toBe('Page 7');
    expect(header.views?.find((view) => view.current)?.key).toBe('history');
  });
});
