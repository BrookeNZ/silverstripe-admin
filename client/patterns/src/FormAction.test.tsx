// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { FormAction } from './FormAction';
import { PopoverField } from './PopoverField';
import type { FieldDescriptor, FieldProps } from './types';
import { mount } from './test/render';



function props(field: Partial<FieldDescriptor>): FieldProps {
  return {
    field: { id: 'Form_action_save', name: 'action_save', readOnly: false, disabled: false, source: [], children: [], ...field },
    value: null,
    onChange: () => undefined,
    onBlur: () => undefined,
    submitting: false,
    renderFields: () => null,
  };
}

describe('FormAction', () => {
  it('draws the primary action filled with its known icon', () => {
    const button = mount(<FormAction {...props({ title: 'Publish', primary: true, icon: 'rocket' })} />);
    expect(button.className).toBe('admin-button admin-button--primary');
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.querySelector('svg.admin-icon--sm')).not.toBeNull();
    expect(button.textContent).toBe('Publish');
  });
});

describe('PopoverField', () => {
  it('opens from an icon-only tertiary button named by its button label when it has no title', () => {
    const root = mount(<PopoverField {...props({ id: 'MoreOptions', title: null, buttonLabel: 'More options' })} />);
    const button = root.querySelector('button')!;
    expect(button.className).toBe('admin-button admin-button--tertiary admin-button--icon-only');
    expect(button.textContent).toBe('More options');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});
