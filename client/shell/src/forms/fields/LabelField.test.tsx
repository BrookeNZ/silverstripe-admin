// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField } from '../types';
import { builtInFields } from './index';
import { LabelField } from './LabelField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The userforms block's OnCompleteMessageLabel as the server sends it
const schema = {
  name: 'OnCompleteMessageLabel',
  id: 'Form_ElementForm_81_OnCompleteMessageLabel',
  type: 'text',
  schemaType: 'Structural',
  component: 'LabelField',
  componentCandidates: ['SilverStripe\\Forms\\LabelField', 'LabelField'],
  title: 'Show on completion',
  readOnly: false,
  disabled: false,
  data: [],
} as unknown as FieldSchema;

const labelField = (data: Record<string, unknown> = {}): FormField => mergeFields([{ ...schema, data }], undefined)[0];

let container: HTMLDivElement;

afterEach(() => container?.remove());

function render(field: FormField): HTMLLabelElement {
  container = document.createElement('div');
  document.body.append(container);
  const props = { field, value: null, onChange: () => undefined, onBlur: () => undefined, submitting: false, renderFields: () => null };
  act(() => createRoot(container).render(<LabelField {...(props as unknown as FieldComponentProps)} />));
  return container.querySelector('label')!;
}

describe('LabelField', () => {
  it('is what the server\'s LabelField component name resolves to', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'LabelField' });
  });

  it('shows its title as a label with no control, and posts nothing', () => {
    const label = render(labelField());
    expect(label.textContent).toBe('Show on completion');
    expect(label.id).toBe('Form_ElementForm_81_OnCompleteMessageLabel');
    expect(label.hasAttribute('for')).toBe(false);
    expect(container.querySelector('input')).toBeNull();
    expect(collectValueFields([labelField()])).toEqual([]);
  });

  it('names the control in data.target', () => {
    expect(render(labelField({ target: 'Form_ElementForm_81_Title' })).htmlFor).toBe('Form_ElementForm_81_Title');
  });
});
