// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFieldComponent } from '../resolve';
import type { FieldComponentProps, FormField } from '../types';
import { builtInFields } from './index';
import { NumberField } from './NumberField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

afterEach(() => container?.remove());

const numericField = (name: string, schemaType: 'Integer' | 'Decimal') =>
  ({
    key: name,
    name,
    id: `Form_EditForm_${name}`,
    holderId: `Form_EditForm_${name}_Holder`,
    title: name,
    type: 'text',
    schemaType,
    component: null,
    componentCandidates: ['SilverStripe\\Forms\\NumericField', 'SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
    readOnly: false,
    disabled: false,
    data: {},
    source: [],
    children: [],
  }) as unknown as FormField;

function render(field: FormField, value: string, onChange = vi.fn()): HTMLInputElement {
  container = document.createElement('div');
  document.body.append(container);
  const props = { field, value, onChange, onBlur: () => undefined, submitting: false, renderFields: () => null } as unknown as FieldComponentProps;
  act(() => createRoot(container).render(<NumberField {...props} />));
  return container.querySelector('input')!;
}

function type(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('NumberField', () => {
  it('is what a NumericField resolves to through its type default', () => {
    const isBuiltIn = (name: string) => name in builtInFields;
    expect(resolveFieldComponent(numericField('RemindDays', 'Integer'), isBuiltIn)).toEqual({ name: 'NumberField' });
    expect(resolveFieldComponent(numericField('Price', 'Decimal'), isBuiltIn)).toEqual({ name: 'NumberField' });
  });

  it('offers a decimal or numeric keyboard and posts the typed text as it is', () => {
    const field = numericField('Price', 'Decimal');
    const onChange = vi.fn();
    const input = render(field, '12.5', onChange);
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.value).toBe('12.5');
    expect(container.querySelector(`label[for="${field.id}"]`)?.textContent).toBe('Price');
    type(input, '1234.75');
    expect(onChange).toHaveBeenCalledWith('1234.75');
    expect(render(numericField('FailedLoginCount', 'Integer'), '3').getAttribute('inputmode')).toBe('numeric');
  });
});
