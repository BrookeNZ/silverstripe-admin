/**
 * Decides whether a field rendered from its server HTML can take part in the form. Only the simplest
 * case can: the HTML holds exactly one named control, it carries the field's own name, it is a plain
 * text-like input, a textarea or a single select, and there are no buttons. Anything else (a grid, a
 * widget built by jQuery, several inputs) is shown but posts nothing, because the shell cannot know
 * how its values map back to the field. The HTML is sanitised with DOMPurify before it is read or shown.
 */
import createDOMPurify from 'dompurify';
import type { DOMPurify } from 'dompurify';

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

const forbiddenTags = [
  'script', 'style', 'link', 'meta', 'base', 'object', 'embed', 'iframe', 'form',
  'set', 'animate', 'animateTransform', 'animateMotion', 'math',
];

// aria-controls and data-toggle point legacy toolbar buttons at Bootstrap modals the shell never renders
const forbiddenAttributes = ['srcdoc', 'srcset', 'poster', 'formaction', 'aria-controls', 'data-toggle'];

const allowedUrl = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let purifier: DOMPurify | undefined;

// Browsers ignore whitespace and control characters inside a URL scheme
function keepsDataUrl(tag: string, attribute: string, value: string): boolean {
  const url = value.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  return !url.startsWith('data:') || (tag === 'img' && attribute === 'src' && url.startsWith('data:image/'));
}

function serverHtmlPurifier(): DOMPurify {
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName.startsWith('on') || !keepsDataUrl(node.nodeName.toLowerCase(), data.attrName, data.attrValue)) {
        data.keepAttr = false;
      }
    });
  }
  return purifier;
}

/**
 * Parses server HTML into a sanitised fragment to append as nodes, never reserialised, so it cannot
 * mutate on a second parse. Scripts, styles, frames, forms, MathML and SVG animation are dropped, as are
 * inline event handlers and any URL that is not http(s), mailto, tel or relative; `data:` survives only
 * as an image `src`.
 */
export function sanitizeServerHtml(html: string): DocumentFragment {
  return serverHtmlPurifier().sanitize(html, {
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: forbiddenAttributes,
    ALLOWED_URI_REGEXP: allowedUrl,
    RETURN_DOM_FRAGMENT: true,
  });
}

/**
 * Sanitises server HTML, and takes the href off its links because they lead to legacy admin URLs
 * outside the shell (a disabled fieldset does not disable them)
 */
export function prepareServerHtml(html: string): { fragment: DocumentFragment; links: number } {
  const fragment = sanitizeServerHtml(html);
  const links = Array.from(fragment.querySelectorAll('a[href], area[href]'));
  for (const link of links) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('title', unavailableLinkTitle);
  }
  return { fragment, links: links.length };
}

export function readControls(html: string): Array<HtmlControl> {
  return Array.from(sanitizeServerHtml(html).querySelectorAll<HTMLElement>('input, select, textarea, button')).map((element) => ({
    tag: element.tagName.toLowerCase(),
    type: (element.getAttribute('type') ?? '').toLowerCase(),
    name: element.getAttribute('name') ?? '',
    multiple: element.hasAttribute('multiple'),
  }));
}

// Every merge of the field tree asks again, and each answer sanitises and parses the HTML. Capped, oldest
// out first, so a long session does not keep every snippet it has seen
const bindings = new Map<string, ServerHtmlBinding>();
const maxBindings = 200;

export function bindServerHtml(name: string, html: string): ServerHtmlBinding {
  const key = `${name}\n${html}`;
  let binding = bindings.get(key);
  if (!binding) {
    binding = serverHtmlBinding(name, readControls(html));
    bindings.set(key, binding);
    if (bindings.size > maxBindings) {
      bindings.delete(bindings.keys().next().value!);
    }
  }
  return binding;
}

export function serverHtmlPosts(name: string, html: string): boolean {
  return bindServerHtml(name, html).posts;
}
