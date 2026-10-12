/**
 * Revealing a field that something has hidden, such as an inactive tab. Whatever wants a field shown
 * dispatches a bubbling DOM event from it; every container that hides content listens on its own
 * element and shows the part holding the event target, synchronously, so the caller can focus the field
 * straight after. A DOM event rather than React context, so a container from another bundle can take
 * part too.
 */
export const revealFieldEvent = 'silverstripe:reveal-field';

export function revealField(element: HTMLElement): void {
  element.dispatchEvent(new CustomEvent(revealFieldEvent, { bubbles: true }));
}
