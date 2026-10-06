// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Toggle } from './Toggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

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

function render(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container.firstElementChild as HTMLElement;
}

const radios = (group: HTMLElement) => Array.from(group.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

afterEach(() => container.remove());

describe('Toggle', () => {
  it('is a named radio group with one radio per option sharing a name', () => {
    const group = render(<Controlled />);
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Stage');
    const [draft, live] = radios(group);
    expect(draft.name).toBeTruthy();
    expect(live.name).toBe(draft.name);
    expect(draft.closest('label')?.textContent).toBe('Draft');
    expect(live.closest('label')?.textContent).toBe('Published');
  });

  it('checks and marks the selected option', () => {
    const group = render(<Controlled />);
    const [draft, live] = radios(group);
    expect(draft.checked).toBe(true);
    expect(live.checked).toBe(false);
    expect(draft.closest('label')?.className).toBe('admin-toggle__option admin-toggle__option--selected');
    expect(live.closest('label')?.className).toBe('admin-toggle__option');
  });

  it('reports a choice through onChange and follows the controlled value', () => {
    const group = render(<Controlled />);
    const [draft, live] = radios(group);
    act(() => live.click());
    expect(live.checked).toBe(true);
    expect(draft.checked).toBe(false);
    expect(live.closest('label')?.className).toContain('admin-toggle__option--selected');
  });

  it('disables an option and leaves the value alone', () => {
    const group = render(<Controlled disabledLive />);
    const [draft, live] = radios(group);
    expect(live.disabled).toBe(true);
    expect(live.closest('label')?.className).toBe('admin-toggle__option admin-toggle__option--disabled');
    act(() => live.click());
    expect(draft.checked).toBe(true);
  });

  it('passes native attributes and a class to the group', () => {
    const group = render(
      <Toggle aria-labelledby="stage-label" className="extra" options={options} value="live" onChange={() => undefined} />,
    );
    expect(group.className).toBe('admin-toggle extra');
    expect(group.getAttribute('aria-labelledby')).toBe('stage-label');
    expect(group.hasAttribute('aria-label')).toBe(false);
  });
});
