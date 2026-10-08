// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, defaultValues, encodeSubmission, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField, FormSchemaState } from '../types';
import { builtInFields } from './index';
import { DateField } from './DateField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The file search form's lastEditedFrom field as the server sends it
const schema = {
  name: 'lastEditedFrom',
  id: 'Form_fileSearchForm_lastEditedFrom',
  holderId: 'Form_fileSearchForm_lastEditedFrom_Holder',
  type: 'date',
  schemaType: 'Date',
  component: null,
  componentCandidates: ['SilverStripe\\Forms\\DateField', 'SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
  title: 'From',
  readOnly: false,
  disabled: false,
  lang: 'en-US',
  data: { maxlength: null, html5: true, min: null, max: null },
} as unknown as FieldSchema;

function dateField(value: string | null, overrides: Partial<FieldSchema> = {}, message: string | null = null): FormField {
  const state: FormSchemaState = {
    id: 'Form_fileSearchForm',
    messages: [],
    fields: [{ name: schema.name, id: schema.id, value, message: message ? { value: message, type: 'error' } : null, data: [] }],
  };
  return mergeFields([{ ...schema, ...overrides }], state)[0];
}

let container: HTMLDivElement;
let posted: () => string;

afterEach(() => container?.remove());

function render(field: FormField): HTMLInputElement {
  container = document.createElement('div');
  document.body.append(container);
  const initial = defaultValues([field])[field.key];
  let current: unknown = initial;
  const Harness = () => {
    const [value, setValue] = React.useState<unknown>(initial);
    current = value;
    const props = { field, value, onChange: setValue, onBlur: () => undefined, error: field.message?.value, submitting: false, renderFields: () => null };
    return <DateField {...(props as unknown as FieldComponentProps)} />;
  };
  act(() => createRoot(container).render(<Harness />));
  posted = () => Array.from(encodeSubmission(collectValueFields([field]), { [field.key]: current }, 'action_search'), ([name, value]) => `${name}=${value}`).join('&');
  return container.querySelector('input')!;
}

function type(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('DateField', () => {
  it('is what a DateField resolves to through its Date type default', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'DateField' });
  });

  it('draws a labelled native date input with the server\'s bounds and posts the ISO date', () => {
    const input = render(dateField('2026-10-01', { data: { html5: true, min: '2026-01-01', max: '2026-12-31' } }));
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-10-01');
    expect([input.min, input.max, input.lang]).toEqual(['2026-01-01', '2026-12-31', 'en-US']);
    expect(container.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('From');
    type(input, '2026-10-09');
    expect(posted()).toBe('lastEditedFrom=2026-10-09&action_search=1');
  });

  it('posts an empty value when the date is cleared or was never set', () => {
    const input = render(dateField(null));
    expect(input.value).toBe('');
    expect(input.hasAttribute('min')).toBe(false);
    expect(posted()).toBe('lastEditedFrom=&action_search=1');
  });

  it('with html5 off, shows and posts the date in the server\'s own format, untouched', () => {
    const input = render(dateField('Oct 9, 2026', { data: { html5: false, min: null, max: null } }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('Oct 9, 2026');
    expect(posted()).toBe('lastEditedFrom=Oct 9, 2026&action_search=1');
    type(input, 'Oct 10, 2026');
    expect(posted()).toBe('lastEditedFrom=Oct 10, 2026&action_search=1');
  });

  it('shows a validation message tied to the input', () => {
    const input = render(dateField('2026-13-01', {}, 'Please enter a valid date format.'));
    const message = container.querySelector('.admin-field__message')!;
    expect(message.textContent).toBe('Please enter a valid date format.');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('is disabled or read-only as the server says, and a read-only date posts nothing', () => {
    expect(render(dateField('2026-10-01', { disabled: true })).disabled).toBe(true);
    container.remove();
    const input = render(dateField('2026-10-01', { readOnly: true }));
    expect(input.readOnly).toBe(true);
    expect(posted()).toBe('action_search=1');
  });
});
