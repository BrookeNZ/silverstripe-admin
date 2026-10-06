// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { prepareServerHtml, unavailableLinkTitle } from './serverHtml';

describe('prepareServerHtml', () => {
  it('takes the href off links and marks them unavailable', () => {
    const prepared = prepareServerHtml('<div><a href="/admin/assets/new" class="btn">Add</a><a name="top">Top</a></div>');
    const body = new DOMParser().parseFromString(prepared.html, 'text/html').body;
    const link = body.querySelector('a.btn')!;
    expect(prepared.links).toBe(1);
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('title')).toBe(unavailableLinkTitle);
    expect(link.textContent).toBe('Add');
  });

  it('drops inline event handler attributes and keeps the rest', () => {
    const prepared = prepareServerHtml('<input name="Slug" value="a" onfocus="alert(1)" ONCLICK="x()"><img src="x.png" onerror="y()" alt="">');
    expect(prepared.html).not.toMatch(/on(focus|click|error)/i);
    expect(prepared.html).toContain('name="Slug"');
    expect(prepared.html).toContain('src="x.png"');
    expect(prepared.links).toBe(0);
  });
});
