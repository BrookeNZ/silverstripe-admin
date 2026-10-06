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

  it('drops srcdoc from frames', () => {
    const prepared = prepareServerHtml('<iframe srcdoc="<script>parent.x()</script>" title="Preview"></iframe>');
    expect(prepared.html).not.toContain('srcdoc');
    expect(prepared.html).toContain('title="Preview"');
  });

  it.each([
    ['img src', '<img src="javascript:x()" alt="">', 'src'],
    ['embed src with a mixed-case scheme', '<embed src=" JaVa\tScRiPt:x()">', 'src'],
    ['svg xlink:href', '<svg><a xlink:href="javascript:x()"><text>t</text></a></svg>', 'xlink:href'],
    ['button formaction', '<button formaction="javascript:x()">Go</button>', 'formaction'],
    ['form action', '<form action="javascript:x()"></form>', 'action'],
    ['object data', '<object data="data:text/html;base64,PHNjcmlwdD54KCk8L3NjcmlwdD4="></object>', 'data'],
    ['embed data:text/html', '<embed src="data:text/html,<script>x()</script>">', 'src'],
  ])('drops a script or HTML URL in %s', (_, html, attribute) => {
    const body = new DOMParser().parseFromString(prepareServerHtml(html).html, 'text/html').body;
    expect(Array.from(body.querySelectorAll('*')).some((element) => element.hasAttribute(attribute))).toBe(false);
  });

  it('keeps ordinary URLs and image data URLs', () => {
    const prepared = prepareServerHtml('<img src="/assets/a.png" alt=""><img src="data:image/png;base64,AA==" alt="">');
    expect(prepared.html).toContain('src="/assets/a.png"');
    expect(prepared.html).toContain('src="data:image/png;base64,AA=="');
  });
});
