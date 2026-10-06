// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';
import type { ComboboxProps } from './Combobox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Fruit {
  value: string;
  label: string;
  disabled?: boolean;
}

const fruit: Fruit[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', disabled: true },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Date' },
];

let container: HTMLDivElement;

function render(props: Partial<ComboboxProps<Fruit>> = {}): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() =>
    createRoot(container).render(
      <Combobox<Fruit> id="fruit" options={fruit} isOptionDisabled={(option) => Boolean(option.disabled)} {...props} />,
    ),
  );
  return container.firstElementChild as HTMLElement;
}

const input = () => container.querySelector<HTMLInputElement>('[role="combobox"]')!;
const listbox = () => container.querySelector<HTMLElement>('[role="listbox"]')!;
const options = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
const active = () => document.getElementById(input().getAttribute('aria-activedescendant') ?? '')?.textContent;

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

function type(text: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => container.remove());

describe('Combobox', () => {
  it('wires the input to a listbox of options', () => {
    render({ 'aria-labelledby': 'fruit_label' });
    expect(input().id).toBe('fruit');
    expect(input().getAttribute('aria-controls')).toBe(listbox().id);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-labelledby')).toBe('fruit_label');
    expect(listbox().getAttribute('aria-labelledby')).toBe('fruit_label');
    expect(listbox().closest('[hidden]')).not.toBeNull();
    expect(options().map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'false']);
    expect(options()[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('opens on ArrowDown and moves the active option past disabled ones', () => {
    render();
    press('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(listbox().closest('[hidden]')).toBeNull();
    expect(active()).toBe('Apple');
    press('ArrowDown');
    expect(active()).toBe('Cherry');
    press('End');
    expect(active()).toBe('Date');
    press('ArrowDown');
    expect(active()).toBe('Date');
    press('Home');
    expect(active()).toBe('Apple');
    press('ArrowUp');
    expect(active()).toBe('Apple');
    expect(options()[0].className).toContain('admin-combobox__option--active');
  });

  it('opens on ArrowUp at the last option', () => {
    render();
    press('ArrowUp');
    expect(active()).toBe('Date');
  });

  it('chooses with Enter, closes and shows the label', () => {
    const onChange = vi.fn();
    render({ onChange });
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(onChange).toHaveBeenCalledWith(fruit[2]);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().value).toBe('Cherry');
    press('ArrowDown');
    expect(active()).toBe('Cherry');
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(options()[2].className).toContain('admin-combobox__option--selected');
  });

  it('closes on Escape without choosing', () => {
    const onChange = vi.fn();
    render({ onChange });
    press('ArrowDown');
    press('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Tab without choosing', () => {
    const onChange = vi.fn();
    render({ onChange });
    press('ArrowDown');
    press('Tab');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters by label as the user types and says when nothing matches', () => {
    const onInputChange = vi.fn();
    render({ onInputChange });
    type('err');
    expect(onInputChange).toHaveBeenCalledWith('err');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.textContent)).toEqual(['Cherry']);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    type('zzz');
    expect(options()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('No options');
  });

  it('follows a controlled value', () => {
    render({ value: fruit[3] });
    expect(input().value).toBe('Date');
  });

  it('jumps to an option by its first letters when not searchable', () => {
    render({ searchable: false });
    expect(input().readOnly).toBe(true);
    expect(input().getAttribute('aria-autocomplete')).toBe('none');
    press('d');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBe('Date');
    press(' ');
    expect(input().value).toBe('Date');
  });

  it('does not open when disabled or read-only', () => {
    render({ readOnly: true });
    press('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('shows multiple choices as tokens with named remove buttons', () => {
    const onChange = vi.fn();
    render({ multiple: true, onChange, name: 'Fruit' });
    expect(listbox().getAttribute('aria-multiselectable')).toBe('true');
    press('ArrowDown');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    expect(onChange).toHaveBeenLastCalledWith([fruit[0], fruit[2]]);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    const tokens = Array.from(container.querySelectorAll('.admin-combobox__token'));
    expect(tokens.map((token) => token.textContent)).toEqual(['Apple', 'Cherry']);
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).map((hidden) => hidden.value)).toEqual(['a', 'c']);
    const remove = tokens[0].querySelector('button')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Apple');
    act(() => remove.click());
    expect(onChange).toHaveBeenLastCalledWith([fruit[2]]);
    expect(document.activeElement).toBe(input());
    press('Backspace');
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(container.querySelectorAll('.admin-combobox__token')).toHaveLength(0);
  });

  it('toggles a chosen option off again when multiple', () => {
    const onChange = vi.fn();
    render({ multiple: true, onChange, defaultValue: [fruit[0]] });
    press('ArrowDown');
    expect(active()).toBe('Apple');
    press('Enter');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('clears the value with a named clear button', () => {
    const onChange = vi.fn();
    render({ clearable: true, defaultValue: fruit[0], onChange, clearLabel: 'Clear fruit' });
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear fruit"]')!;
    act(() => clear.click());
    expect(onChange).toHaveBeenCalledWith(null);
    expect(input().value).toBe('');
  });

  it('marks the listbox busy while loadOptions resolves and drops a stale answer', async () => {
    const resolvers: Array<(result: Fruit[]) => void> = [];
    const loadOptions = vi.fn(() => new Promise<Fruit[]>((resolve) => resolvers.push(resolve)));
    render({ loadOptions, loadingMessage: 'Loading fruit' });
    type('a');
    type('ap');
    expect(loadOptions).toHaveBeenLastCalledWith('ap');
    expect(listbox().getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Loading fruit');
    await act(async () => resolvers[1]([fruit[0]]));
    expect(listbox().hasAttribute('aria-busy')).toBe(false);
    expect(options().map((option) => option.textContent)).toEqual(['Apple']);
    await act(async () => resolvers[0]([fruit[3]]));
    expect(options().map((option) => option.textContent)).toEqual(['Apple']);
  });

  it('lets onKeyDown take a key and see the active option', () => {
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>, option?: Fruit) => {
      if (event.key === 'ArrowRight' && option) {
        event.preventDefault();
      }
    });
    render({ onKeyDown });
    press('ArrowDown');
    press('ArrowRight');
    expect(onKeyDown).toHaveBeenLastCalledWith(expect.anything(), fruit[0]);
  });

  it('renders custom option content', () => {
    render({ renderOption: (option, { selected }) => <strong>{`${option.label}${selected ? ' (chosen)' : ''}`}</strong> });
    expect(options()[0].innerHTML).toBe('<strong>Apple</strong>');
  });
});
