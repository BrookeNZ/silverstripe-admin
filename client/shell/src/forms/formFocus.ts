/**
 * Where focus goes around a post: back to the control that posted it, or to the first field a
 * server or client error names.
 */
import type { FormField } from './types';

const focusable = 'input:not([type="hidden"]), select, textarea, button, [tabindex]';

/** Focuses the element unless something else has taken focus meanwhile */
export function focusById(id: string | undefined): void {
  const element = id ? document.getElementById(id) : null;
  if (element && (document.activeElement === null || document.activeElement === document.body)) {
    element.focus();
  }
}

/** The element to focus for a field: its control, or for a group such as radios the checked or first control */
export function fieldFocusTarget(field: FormField): HTMLElement | null {
  const element = document.getElementById(field.id) ?? (field.holderId ? document.getElementById(field.holderId) : null);
  if (!element || element.matches(focusable)) {
    return element;
  }
  return element.querySelector<HTMLElement>('input:checked') ?? element.querySelector<HTMLElement>(focusable) ?? element;
}
