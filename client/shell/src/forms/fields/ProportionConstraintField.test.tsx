// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, defaultValues, encodeSubmission, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField, FormSchemaState } from '../types';
import { builtInFields } from './index';
import { NumberField } from './NumberField';
import { ProportionConstraintField } from './ProportionConstraintField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The file insert form's Dimensions group for a 1480 by 1020 image, as the server sends it
const dimension = (name: string) => ({
  name,
  id: `Form_fileInsertForm_${name}`,
  holderId: `Form_fileInsertForm_${name}_Holder`,
  type: 'number',
  schemaType: 'Decimal',
  component: null,
  title: name,
  readOnly: false,
  disabled: false,
  data: { maxlength: 5 },
  children: [],
});
const schema = {
  name: 'Dimensions',
  id: 'Form_fileInsertForm_Dimensions',
  holderId: 'Form_fileInsertForm_Dimensions_Holder',
  type: 'text',
  schemaType: 'Structural',
  component: 'ProportionConstraintField',
  componentCandidates: ['ProportionConstraintField'],
  title: false,
  readOnly: null,
  disabled: false,
  data: { tag: 'div' },
  children: [dimension('Width'), dimension('Height')],
} as unknown as FieldSchema;

function dimensions(width: string, originalWidth = 1480, message: string | null = null): FormField {
  const state: FormSchemaState = {
    id: 'Form_fileInsertForm',
    messages: [],
    fields: [
      { name: 'Dimensions', id: schema.id, value: null, message: null, data: { ratio: 1480 / 1020, originalWidth, originalHeight: 1020 } },
      { name: 'Width', id: 'Form_fileInsertForm_Width', value: width, message: message ? { value: message, type: 'error' } : null, data: [] },
      { name: 'Height', id: 'Form_fileInsertForm_Height', value: '', message: null, data: [] },
    ],
  };
  return mergeFields([schema], state)[0];
}

let container: HTMLDivElement;
let posted: () => string;

afterEach(() => container?.remove());

// A stand-in for the form: holds the values by key, binds each dimension to them and autofills by posted name
function render(group: FormField) {
  container = document.createElement('div');
  document.body.append(container);
  const valueFields = collectValueFields([group]);
  let current = defaultValues(valueFields);
  const Harness = () => {
    const [values, setValues] = React.useState(current);
    current = values;
    const set = (key: string, value: unknown) => setValues((previous) => ({ ...previous, [key]: value }));
    const base = { onBlur: () => undefined, submitting: false, autofill: (name: string, value: unknown) => set(name, value) };
    const renderFields = (fields: ReadonlyArray<FormField>) =>
      fields.map((field) => (
        <NumberField
          key={field.key}
          {...(base as unknown as FieldComponentProps)}
          field={field}
          value={values[field.key]}
          error={field.message?.value}
          onChange={(value) => set(field.key, value)}
          renderFields={() => null}
        />
      ));
    return (
      <ProportionConstraintField
        {...(base as unknown as FieldComponentProps)}
        field={group}
        value={null}
        onChange={() => undefined}
        renderFields={renderFields as FieldComponentProps['renderFields']}
      />
    );
  };
  act(() => createRoot(container).render(<Harness />));
  posted = () => Array.from(encodeSubmission(valueFields, current, 'action_insert'), ([name, value]) => `${name}=${value}`).join('&');
}

const input = (name: string) => container.querySelector<HTMLInputElement>(`#Form_fileInsertForm_${name}`)!;

function type(name: string, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input(name), text);
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(name: string): void {
  act(() => {
    input(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

describe('ProportionConstraintField', () => {
  it('is what the insert form\'s Dimensions group resolves to', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'ProportionConstraintField' });
  });

  it('starts at the original width with the height in proportion, since the server sends both empty', () => {
    render(dimensions(''));
    expect([input('Width').value, input('Height').value]).toEqual(['1480', '1020']);
    expect(container.querySelector('label[for="Form_fileInsertForm_Width"]')?.textContent).toBe('Width');
    expect(posted()).toBe('Width=1480&Height=1020&action_insert=1');
  });

  it('starts no wider than 600 for an image with no known width', () => {
    render(dimensions('', 0));
    expect(input('Width').value).toBe('600');
  });

  it('keeps the other dimension in proportion as either is typed, and posts both', () => {
    render(dimensions(''));
    type('Width', '740');
    expect(input('Height').value).toBe('510');
    type('Height', '102');
    expect(input('Width').value).toBe('148');
    expect(posted()).toBe('Width=148&Height=102&action_insert=1');
  });

  it('resets both when a dimension is left empty or not positive', () => {
    render(dimensions(''));
    type('Width', '740');
    type('Height', '0');
    expect(input('Width').value).toBe('740');
    blur('Height');
    expect([input('Width').value, input('Height').value]).toEqual(['1480', '1020']);
  });

  it('shows a dimension\'s validation message under it', () => {
    render(dimensions('', 1480, 'Width must be a number'));
    expect(container.querySelector('#Form_fileInsertForm_Width_Holder .admin-field__message')?.textContent).toBe('Width must be a number');
  });
});
