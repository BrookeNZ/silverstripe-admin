// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, defaultValues, encodeSubmission, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField, FormSchemaState } from '../types';
import { builtInFields } from './index';
import { HtmlReadonlyField } from './HtmlReadonlyField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A page's Content field after performReadonlyTransformation, as the server sends it
const schema = {
  name: 'Content',
  id: 'Form_EditForm_Content',
  holderId: 'Form_EditForm_Content_Holder',
  type: 'structural',
  schemaType: 'Structural',
  component: 'HtmlReadonlyField',
  componentCandidates: ['SilverStripe\\Forms\\HTMLReadonlyField', 'HtmlReadonlyField'],
  title: 'Content',
  description: 'Locked while the page is under review',
  readOnly: true,
  disabled: false,
  data: [],
} as unknown as FieldSchema;

const titleSchema = {
  name: 'Title',
  id: 'Form_EditForm_Title',
  type: 'text',
  schemaType: 'String',
  component: 'TextField',
  componentCandidates: ['SilverStripe\\Forms\\TextField', 'TextField'],
  title: 'Page name',
  readOnly: false,
  disabled: false,
  data: [],
} as unknown as FieldSchema;

function fields(content: string): Array<FormField> {
  const state: FormSchemaState = {
    id: 'Form_EditForm',
    messages: [],
    fields: [
      { name: 'Content', id: schema.id, value: content, message: null, data: [] },
      { name: 'Title', id: titleSchema.id, value: 'About us', message: null, data: [] },
    ],
  };
  return mergeFields([schema, titleSchema], state);
}

let container: HTMLDivElement;

afterEach(() => container?.remove());

function render(field: FormField): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const props = { field, value: field.value, onChange: () => undefined, onBlur: () => undefined, submitting: false, renderFields: () => null };
  act(() => createRoot(container).render(<HtmlReadonlyField {...(props as unknown as FieldComponentProps)} />));
  return container.querySelector<HTMLElement>(`#${field.id}`)!;
}

describe('HtmlReadonlyField', () => {
  it('is what the server\'s HtmlReadonlyField component name resolves to', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'HtmlReadonlyField' });
  });

  it('shows the HTML value under the title and description, in the legacy holder', () => {
    const content = render(fields('<p>Welcome to <strong>our site</strong></p><p><a href="https://example.com/">Read more</a></p>')[0]);
    expect(content.innerHTML).toBe('<p>Welcome to <strong>our site</strong></p><p><a href="https://example.com/">Read more</a></p>');
    expect(content.closest('.admin-field')?.id).toBe('Form_EditForm_Content_Holder');
    expect(container.querySelector('.admin-field__label')?.textContent).toBe('Content');
    expect(container.querySelector('.admin-field__description')?.textContent).toBe('Locked while the page is under review');
    expect(container.querySelector('input, textarea, select')).toBeNull();
  });

  it('drops scripts, inline handlers and script URLs from the value', () => {
    const content = render(
      fields('<p onclick="alert(1)">Hi<script>alert(2)</script></p><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">Go</a>')[0],
    );
    expect(content.querySelector('script')).toBeNull();
    expect(content.querySelector('[onclick], [onerror]')).toBeNull();
    expect(content.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(content.querySelector('p')?.textContent).toBe('Hi');
  });

  it('posts nothing, while the fields beside it still post', () => {
    const valueFields = collectValueFields(fields('<p>Hello</p>'));
    expect(encodeSubmission(valueFields, defaultValues(valueFields), 'action_save').toString()).toBe('Title=About+us&action_save=1');
  });
});
