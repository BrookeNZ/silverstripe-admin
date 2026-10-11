// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { Toggle } from './Toggle';
import { mount } from './test/render';

const options = [
  { key: 'draft', label: 'Draft' },
  { key: 'live', label: 'Published' },
];

const Controlled = ({ disabledLive = false }: { disabledLive?: boolean }) => {
  const [value, setValue] = React.useState('draft');
  return (
    <Toggle
      label="Stage"
      options={options.map((option) => ({ ...option, disabled: disabledLive && option.key === 'live' }))}
      value={value}
      onChange={setValue}
    />
  );
};


const radios = (group: HTMLElement) => Array.from(group.querySelectorAll<HTMLInputElement>('input[type="radio"]'));


describe('Toggle', () => {
  it('is a named radio group with one radio per option sharing a name', () => {
    const group = mount(<Controlled />);
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Stage');
    const [draft, live] = radios(group);
    expect(draft.name).toBeTruthy();
    expect(live.name).toBe(draft.name);
    expect(draft.closest('label')?.textContent).toBe('Draft');
    expect(live.closest('label')?.textContent).toBe('Published');
  });

  it('checks and marks the selected option', () => {
    const group = mount(<Controlled />);
    const [draft, live] = radios(group);
    expect(draft.checked).toBe(true);
    expect(live.checked).toBe(false);
    expect(draft.closest('label')?.className).toBe('admin-toggle__option admin-toggle__option--selected');
    expect(live.closest('label')?.className).toBe('admin-toggle__option');
  });

  it('reports a choice through onChange and follows the controlled value', () => {
    const group = mount(<Controlled />);
    const [draft, live] = radios(group);
    act(() => live.click());
    expect(live.checked).toBe(true);
    expect(draft.checked).toBe(false);
    expect(live.closest('label')?.className).toContain('admin-toggle__option--selected');
  });

  it('disables an option and leaves the value alone', () => {
    const group = mount(<Controlled disabledLive />);
    const [draft, live] = radios(group);
    expect(live.disabled).toBe(true);
    expect(live.closest('label')?.className).toBe('admin-toggle__option admin-toggle__option--disabled');
    act(() => live.click());
    expect(draft.checked).toBe(true);
  });
});
