// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import type { FieldComponentProps } from '../types';
import { builtInFields } from './index';
import { ToggleCompositeField, startsClosed, toggleCompositeFieldClass } from './ToggleCompositeField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

afterEach(() => container?.remove());

const metadata = (attributes: Record<string, unknown>, data: Record<string, unknown> = {}) =>
  ({
    id: 'Form_EditForm_Metadata',
    holderId: 'Form_EditForm_Metadata_Holder',
    name: 'Metadata',
    title: 'Metadata',
    component: 'CompositeField',
    schemaType: 'Structural',
    attributes,
    data,
    headingLevel: null,
    children: [],
  }) as unknown as FieldComponentProps['field'];

function render(field: FieldComponentProps['field']): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const props = { field, renderFields: () => <input id="Form_EditForm_MetaTitle" /> } as unknown as FieldComponentProps;
  act(() => createRoot(container).render(<ToggleCompositeField {...props} />));
  return container.firstElementChild as HTMLElement;
}

describe('ToggleCompositeField', () => {
  it('is what the page form\'s Metadata group resolves to', () => {
    const field = {
      component: 'CompositeField',
      schemaType: 'Structural',
      componentCandidates: [toggleCompositeFieldClass, 'SilverStripe\\Forms\\CompositeField', 'CompositeField'],
    };
    expect(resolveFieldComponent(field, (name) => name in builtInFields)).toEqual({ name: toggleCompositeFieldClass });
  });

  it('reads the start state from the legacy class, then from data.startClosed', () => {
    expect(startsClosed(metadata({ class: 'field CompositeField togglecomposite ss-toggle ss-toggle-start-closed' }))).toBe(true);
    expect(startsClosed(metadata({ class: 'field CompositeField togglecomposite ss-toggle' }))).toBe(false);
    expect(startsClosed(metadata({ class: 'ss-toggle ss-toggle-start-closed' }, { startClosed: false }))).toBe(false);
  });

  it('renders a closed h3 disclosure with the legacy id and the children inside', () => {
    const root = render(metadata({ class: 'ss-toggle ss-toggle-start-closed' }));
    expect(root.id).toBe('Form_EditForm_Metadata');
    expect(root.querySelector('h3 > button')?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector<HTMLElement>('.admin-disclosure__panel')?.hidden).toBe(true);
    expect(root.querySelector('#Form_EditForm_MetaTitle')).not.toBeNull();
  });
});
