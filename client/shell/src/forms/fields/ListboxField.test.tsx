// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useController, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import { collectValueFields, defaultValues, encodeSubmission, mergeFields } from '../schema';
import type { FieldComponentProps, FieldSchema, FormField, FormSchemaState } from '../types';
import { builtInFields } from './index';
import { ListboxField } from './ListboxField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Member edit form's DirectGroups field as the server sends it once sudo mode is on
const groups = [
  { Title: 'ADMIN group', Value: 4, Selected: true, Disabled: false },
  { Title: 'Administrators', Value: 2, Selected: false, Disabled: false },
  { Title: 'Content Authors', Value: 1, Selected: false, Disabled: false },
];
const schema = {
  name: 'DirectGroups',
  id: 'Form_ItemEditForm_DirectGroups',
  holderId: 'Form_ItemEditForm_DirectGroups_Holder',
  type: 'text',
  schemaType: 'MultiSelect',
  component: 'ListboxField',
  componentCandidates: ['SilverStripe\\Forms\\ListboxField', 'ListboxField'],
  title: 'Groups',
  readOnly: false,
  disabled: false,
  attributes: { 'data-placeholder': 'Add group', multiple: 'true' },
  data: [],
  options: groups,
} as unknown as FieldSchema;

function directGroups(overrides: Partial<FieldSchema> = {}, message: string | null = null): FormField {
  const state: FormSchemaState = {
    id: 'Form_ItemEditForm',
    messages: [],
    fields: [
      {
        name: 'DirectGroups',
        id: schema.id,
        value: [groups[0]],
        message: message ? { value: message, type: 'error' } : null,
        data: [],
        source: groups.map((group) => ({ value: group.Value, title: group.Title, disabled: false })),
      },
    ],
  };
  return mergeFields([{ ...schema, ...overrides }], state)[0];
}

let container: HTMLDivElement;
let posted: () => string;
let dirty: () => boolean;

afterEach(() => container?.remove());

// Bound to react-hook-form from the shell's starting values, as FormSchemaForm binds a field
function render(field: FormField) {
  container = document.createElement('div');
  document.body.append(container);
  const valueFields = collectValueFields([field]);
  let current: Record<string, unknown> = {};
  let isDirty = false;
  const Harness = () => {
    const { control, formState, watch } = useForm({ defaultValues: defaultValues(valueFields) });
    const { field: binding } = useController({ name: field.key, control });
    current = watch();
    isDirty = formState.isDirty;
    const props = {
      field,
      value: binding.value,
      onChange: binding.onChange,
      onBlur: binding.onBlur,
      error: field.message?.value,
      submitting: false,
      renderFields: () => null,
    } as unknown as FieldComponentProps;
    return <ListboxField {...props} />;
  };
  act(() => createRoot(container).render(<Harness />));
  posted = () => Array.from(encodeSubmission(valueFields, current, 'action_doSave'), ([name, value]) => `${name}=${value}`).join('&');
  dirty = () => isDirty;
}

const input = () => container.querySelector<HTMLInputElement>('[role="combobox"]')!;
const tokens = () => Array.from(container.querySelectorAll('.admin-combobox__token')).map((token) => token.textContent);

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('ListboxField', () => {
  it('is what the server\'s ListboxField component name resolves to', () => {
    expect(resolveFieldComponent(schema, (name) => name in builtInFields)).toEqual({ name: 'ListboxField' });
  });

  it('shows the chosen groups as tokens under the field label, with the placeholder only when none are chosen', () => {
    render(directGroups());
    expect(tokens()).toEqual(['ADMIN group']);
    const label = container.querySelector('.admin-field__label')!;
    expect(label.textContent).toBe('Groups');
    expect(input().getAttribute('aria-labelledby')).toBe(label.id);
    expect(input().placeholder).toBe('');
    act(() => container.querySelector<HTMLButtonElement>('.admin-combobox__token button')!.click());
    expect(tokens()).toEqual([]);
    expect(input().placeholder).toBe('Add group');
  });

  it('posts the chosen values as a list, which the server\'s validator accepts', () => {
    render(directGroups());
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(tokens()).toEqual(['ADMIN group', 'Administrators']);
    expect(posted()).toBe('DirectGroups[]=4&DirectGroups[]=2&action_doSave=1');
  });

  it('posts the chosen values untouched, which the server\'s validator accepts', () => {
    render(directGroups());
    expect(dirty()).toBe(false);
    expect(posted()).toBe('DirectGroups[]=4&action_doSave=1');
  });

  it('leaves the form clean when a group is added and removed again', () => {
    render(directGroups());
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(dirty()).toBe(true);
    act(() => container.querySelectorAll<HTMLButtonElement>('.admin-combobox__token button')[1].click());
    expect(tokens()).toEqual(['ADMIN group']);
    expect(dirty()).toBe(false);
  });

  it('posts nothing for the field once every group is removed', () => {
    render(directGroups());
    press('Backspace');
    expect(posted()).toBe('action_doSave=1');
  });

  it('shows a server validation message and ties it to the input', () => {
    render(directGroups({}, 'Not an allowed value'));
    const message = container.querySelector('.admin-error-text')!;
    expect(message.textContent).toBe('Not an allowed value');
    expect(input().getAttribute('aria-describedby')).toBe(message.id);
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('does not open or change when disabled', () => {
    render(directGroups({ disabled: true }));
    press('ArrowDown');
    expect(input().disabled).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(tokens()).toEqual(['ADMIN group']);
    expect(container.querySelector('.admin-combobox__token button')).toBeNull();
  });
});
