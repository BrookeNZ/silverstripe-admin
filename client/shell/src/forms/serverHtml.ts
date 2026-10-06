/**
 * Decides whether a field rendered from its server HTML can take part in the form. Only the simplest
 * case can: the HTML holds exactly one named control, it carries the field's own name, it is a plain
 * text-like input, a textarea or a single select, and there are no buttons. Anything else (a grid, a
 * widget built by jQuery, several inputs) is shown but posts nothing, because the shell cannot know
 * how its values map back to the field.
 */

export interface HtmlControl {
  tag: string;
  type: string;
  name: string;
  multiple: boolean;
}

export interface ServerHtmlBinding {
  posts: boolean;
  /** Why the field posts nothing */
  reason?: string;
}

const plainInputTypes = new Set(['', 'text', 'email', 'url', 'tel', 'search', 'number', 'password', 'date', 'datetime-local', 'time', 'month', 'week', 'color']);

const buttonTypes = new Set(['submit', 'button', 'reset', 'image']);

function isPlainControl(control: HtmlControl): boolean {
  switch (control.tag) {
    case 'textarea':
      return true;
    case 'select':
      return !control.multiple;
    case 'input':
      return plainInputTypes.has(control.type);
    default:
      return false;
  }
}

export function serverHtmlBinding(name: string, controls: ReadonlyArray<HtmlControl>): ServerHtmlBinding {
  if (controls.some((control) => control.tag === 'button' || (control.tag === 'input' && buttonTypes.has(control.type)))) {
    return { posts: false, reason: 'it contains buttons' };
  }
  const named = controls.filter((control) => control.name !== '');
  if (named.length !== 1) {
    return { posts: false, reason: named.length === 0 ? 'it has no named control' : 'it has several named controls' };
  }
  if (named[0].name !== name) {
    return { posts: false, reason: `its control is named ${named[0].name}` };
  }
  if (!isPlainControl(named[0])) {
    return { posts: false, reason: 'its control is not a plain input' };
  }
  return { posts: true };
}

export const unavailableLinkTitle = 'Not available in the shell yet';

const urlAttributes = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'data']);

// Browsers ignore whitespace and control characters inside a URL scheme, so `java\tscript:` still runs
function isScriptUrl(value: string): boolean {
  const url = value.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  return url.startsWith('javascript:') || url.startsWith('vbscript:') || url.startsWith('data:text/html');
}

/**
 * Makes server HTML safe to inject: inline event handler attributes, `srcdoc` and script or HTML
 * `data:` URLs are dropped, and links lose their href because they lead to legacy admin URLs outside the
 * shell (a disabled fieldset does not disable them)
 */
export function prepareServerHtml(html: string): { html: string; links: number } {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  for (const element of Array.from(body.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || (urlAttributes.has(name) && isScriptUrl(attribute.value))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  const links = Array.from(body.querySelectorAll('a[href], area[href]'));
  for (const link of links) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('title', unavailableLinkTitle);
  }
  return { html: body.innerHTML, links: links.length };
}

export function readControls(html: string): Array<HtmlControl> {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return Array.from(body.querySelectorAll<HTMLElement>('input, select, textarea, button')).map((element) => ({
    tag: element.tagName.toLowerCase(),
    type: (element.getAttribute('type') ?? '').toLowerCase(),
    name: element.getAttribute('name') ?? '',
    multiple: element.hasAttribute('multiple'),
  }));
}

const bindings = new Map<string, ServerHtmlBinding>();

export function bindServerHtml(name: string, html: string): ServerHtmlBinding {
  const key = `${name}\n${html}`;
  let binding = bindings.get(key);
  if (!binding) {
    binding = serverHtmlBinding(name, readControls(html));
    bindings.set(key, binding);
  }
  return binding;
}

export function serverHtmlPosts(name: string, html: string): boolean {
  return bindServerHtml(name, html).posts;
}
