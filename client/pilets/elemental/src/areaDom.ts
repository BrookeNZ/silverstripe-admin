/**
 * The area's reach into the page around it: the heading that names it, and focus that has to wait for
 * the next frame's render.
 */

/**
 * The text of a heading placed directly before the area, as a page with two areas names each with a
 * HeaderField; null when the field before it is anything else. Piral wraps every field in its own
 * piral-component element, so wrappers holding a single element are looked through
 */
export function precedingHeading(element: HTMLElement | null): string | null {
  let current = element;
  while (current && !current.previousElementSibling && !current.parentElement?.matches('form, .shell-form')) {
    current = current.parentElement;
  }
  let before = current?.previousElementSibling ?? null;
  while (before && !before.matches('h1, h2, h3, h4, h5, h6') && before.childElementCount === 1) {
    before = before.firstElementChild;
  }
  return before?.matches('h1, h2, h3, h4, h5, h6') ? before.textContent?.trim() || null : null;
}

export function focusLater(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
