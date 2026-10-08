// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { previewLinks } from './previewLinks';

const base = 'https://example.test/admin/pages/edit/show/1';

const navigator = (items: string) => [{ name: 'SilverStripeNavigator', value: `<div class="cms-navigator">${items}</div>` }];

describe('previewLinks', () => {
  it('reads the draft and published links from the navigator', () => {
    const fields = navigator(
      '<a href="https://example.test/about/?stage=Stage" data-name="StageLink">Draft</a>' +
        '<a href="https://example.test/about-us/?stage=Live" data-name="LiveLink">Published</a>',
    );
    expect(previewLinks(fields, base)).toEqual({
      draft: 'https://example.test/about/?stage=Stage&CMSPreview=1',
      live: 'https://example.test/about-us/?stage=Live&CMSPreview=1',
    });
  });

  it('resolves relative links and decodes entities', () => {
    const fields = navigator('<a href="/about/?stage=Stage&amp;l=en_NZ">Draft</a>');
    expect(previewLinks(fields, base).draft).toBe('https://example.test/about/?stage=Stage&l=en_NZ&CMSPreview=1');
  });

  it('reads the select the navigator draws for five or more states', () => {
    const fields = navigator('<select><option data-link="/about/?stage=Stage" value="/about/?stage=Stage">Draft</option></select>');
    expect(previewLinks(fields, base).draft).toBe('https://example.test/about/?stage=Stage&CMSPreview=1');
  });

  it('has only the draft link for a page never published', () => {
    expect(previewLinks(navigator('<a href="/about/?stage=Stage">Draft</a>'), base)).toEqual({
      draft: 'https://example.test/about/?stage=Stage&CMSPreview=1',
    });
  });

  it('ignores archived versions and links without a stage', () => {
    const fields = navigator('<a href="/about/?stage=Stage&amp;archiveDate=2026-01-01">Archived</a><a href="/about/">Site</a>');
    expect(previewLinks(fields, base)).toEqual({});
  });

  it('has none for a form without the navigator', () => {
    expect(previewLinks([{ name: 'Title', value: 'About' }], base)).toEqual({});
    expect(previewLinks([{ name: 'SilverStripeNavigator', value: null }], base)).toEqual({});
  });
});
