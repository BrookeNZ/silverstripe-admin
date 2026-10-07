// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareServerHtml, unavailableLinkTitle } from './serverHtml';

function prepare(html: string): { html: string; links: number; root: HTMLElement } {
  const prepared = prepareServerHtml(html);
  const root = document.createElement('div');
  root.append(prepared.fragment);
  return { html: root.innerHTML, links: prepared.links, root };
}

function hasAttribute(root: HTMLElement, attribute: string): boolean {
  return Array.from(root.querySelectorAll('*')).some((element) => element.hasAttribute(attribute));
}

describe('prepareServerHtml', () => {
  it('drops a toolbar button\'s pointers at a legacy modal', () => {
    const prepared = prepare(
      '<button id="Form_EditForm_action_import" class="btn" data-toggle="modal" aria-controls="Form_EditForm_import_modal">Import CSV</button>',
    );
    expect(hasAttribute(prepared.root, 'data-toggle')).toBe(false);
    expect(hasAttribute(prepared.root, 'aria-controls')).toBe(false);
    expect(prepared.root.querySelector('button')?.textContent).toBe('Import CSV');
  });

  it('takes the href off links and marks them unavailable', () => {
    const prepared = prepare('<div><a href="/admin/assets/new" class="btn">Add</a><a name="top">Top</a></div>');
    const link = prepared.root.querySelector('a.btn')!;
    expect(prepared.links).toBe(1);
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('title')).toBe(unavailableLinkTitle);
    expect(link.textContent).toBe('Add');
  });

  it('drops inline event handler attributes and keeps the rest', () => {
    const prepared = prepare('<input name="Slug" value="a" onfocus="alert(1)" ONCLICK="x()"><img src="x.png" onerror="y()" alt="">');
    expect(prepared.html).not.toMatch(/on(focus|click|error)/i);
    expect(prepared.html).toContain('name="Slug"');
    expect(prepared.html).toContain('src="x.png"');
    expect(prepared.links).toBe(0);
  });

  it.each([
    ['img src', '<img src="javascript:x()" alt="">', 'src'],
    ['svg xlink:href', '<svg><a xlink:href="javascript:x()"><text>t</text></a></svg>', 'xlink:href'],
    ['button formaction', '<button formaction="/x">Go</button>', 'formaction'],
    ['img srcset', '<img srcset="x 1x" alt="">', 'srcset'],
    ['video poster', '<video poster="y"></video>', 'poster'],
    ['svg use data:', '<svg><use href="data:image/svg+xml,<svg id=\'x\'/>#x"></use></svg>', 'href'],
    ['image data: outside img', '<video src="data:video/mp4;base64,AA=="></video>', 'src'],
    ['img data:text/html', '<img src="data:text/html,<script>x()</script>" alt="">', 'src'],
  ])('drops an unsafe attribute in %s', (_, html, attribute) => {
    expect(hasAttribute(prepare(html).root, attribute)).toBe(false);
  });

  it.each([
    ['script', '<script>x()</script>', 'script'],
    ['style', '<style>body{background:url(javascript:1)}</style>', 'style'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=/admin/security/">', 'meta'],
    ['link', '<link rel="stylesheet" href="x">', 'link'],
    ['base', '<base href="https://example.com/">', 'base'],
    ['object', '<object data="data:image/svg+xml,<svg onload=x()></svg>"></object>', 'object'],
    ['embed', '<embed src="/x.swf">', 'embed'],
    ['iframe', '<iframe src="data:application/xhtml+xml,<x/>"></iframe>', 'iframe'],
    ['iframe srcdoc', '<iframe srcdoc="<script>parent.x()</script>" title="Preview"></iframe>', 'iframe'],
    ['form', '<form action="javascript:x()"><input name="a"></form>', 'form'],
    ['svg set', '<svg><a><set attributeName="href" to="javascript:alert(1)"/>x</a></svg>', 'set'],
    ['svg animate', '<svg><a><animate attributeName="href" values="javascript:alert(1)"/>x</a></svg>', 'animate'],
    ['math', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', 'math, mglyph, style'],
    ['form and math', '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>', 'form, math, mglyph, style'],
  ])('drops %s', (_, html, selector) => {
    const prepared = prepare(html);
    expect(prepared.root.querySelector(selector)).toBeNull();
    expect(prepared.html).not.toMatch(/javascript:|onerror|onload/i);
  });

  it('keeps the controls of a dropped form', () => {
    expect(prepare('<form><input name="a"></form>').root.querySelector('input[name="a"]')).not.toBeNull();
  });

  it('keeps ordinary URLs and image data URLs', () => {
    const prepared = prepare('<img src="/assets/a.png" alt=""><img src="data:image/png;base64,AA==" alt=""><img src="https://example.com/b.png" alt="">');
    expect(prepared.html).toContain('src="/assets/a.png"');
    expect(prepared.html).toContain('src="data:image/png;base64,AA=="');
    expect(prepared.html).toContain('src="https://example.com/b.png"');
  });
});
