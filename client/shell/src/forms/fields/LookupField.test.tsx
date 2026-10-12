// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField, FormSchemaState } from '../types';
import { builtInFields } from './index';
import { LookupField } from './LookupField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Member edit form's DirectGroups field as the server sends it while sudo mode is off
const schema = {
  name: 'DirectGroups',
  id: 'Form_ItemEditForm_DirectGroups',
  holderId: 'Form_ItemEditForm_DirectGroups_Holder',
  type: 'text',
  schemaType: 'MultiSelect',
  component: 'LookupField',
  componentCandidates: ['SilverStripe\\Forms\\LookupField', 'LookupField'],
  title: 'Groups',
  readOnly: true,
  disabled: false,
  data: [],
} as unknown as FieldSchema;

const source = [
  { value: 4, title: 'ADMIN group', disabled: false },
  { value: 2, title: 'Administrators', disabled: false },
  { value: 1, title: 'Content Authors', disabled: false },
];

function lookup(value: unknown): FormField {
  const state: FormSchemaState = { id: 'Form_ItemEditForm', messages: [], fields: [{ name: schema.name, id: schema.id, value, message: null, data: [], source }] };
  return mergeFields([schema], state)[0];
}

let container: HTMLDivElement;

afterEach(() => container?.remove());

function render(field: FormField): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const props = { field, value: field.value, onChange: () => undefined, onBlur: () => undefined, submitting: false, renderFields: () => null };
  act(() => createRoot(container).render(<LookupField {...(props as unknown as FieldComponentProps)} />));
  return container.querySelector<HTMLElement>(`#${field.id}`)!;
}

describe('LookupField', () => {
  it('is what the server\'s LookupField component name resolves to', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'LookupField' });
  });

  it('shows the chosen options\' titles as text under the label, with no control', () => {
    const text = render(lookup([4, '1']));
    expect(text.textContent).toBe('ADMIN group, Content Authors');
    expect(container.querySelector('.admin-field__label')?.textContent).toBe('Groups');
    expect(container.querySelector('input, select')).toBeNull();
  });

  it('shows a single chosen value, and says none when nothing is chosen', () => {
    expect(render(lookup(2)).textContent).toBe('Administrators');
    container.remove();
    expect(render(lookup([])).textContent).toBe('(None)');
  });

  it('posts nothing', () => {
    expect(collectValueFields([lookup([4])])).toEqual([]);
  });
});
