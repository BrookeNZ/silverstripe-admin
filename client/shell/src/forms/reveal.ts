/**
 * Revealing a field that something has hidden, such as an inactive tab. The form dispatches a bubbling
 * DOM event from the field; every container that hides content listens on its own element and shows
 * the part holding the event target, synchronously, so the form can focus the field straight after.
 * A DOM event rather than React context, so a tab component a pilet registers can take part too.
 */
export const revealFieldEvent = 'silverstripe:reveal-field';

export function revealField(element: HTMLElement): void {
  element.dispatchEvent(new CustomEvent(revealFieldEvent, { bubbles: true }));
}
