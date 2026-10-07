// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component as TreeDropdownField } from './TreeDropdownField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tree = {
  id: 0,
  title: '',
  count: 2,
  children: [
    { id: 1, title: 'Photography', count: 2, children: [{ id: 3, title: 'Portraits', count: 0, children: [] }, { id: 4, title: 'Landscapes', count: 0, children: [] }] },
    { id: 2, title: 'Documents', count: 0, children: [] },
  ],
};

let container: HTMLDivElement;

const Host = ({ value = 0, showSelectedPath = false }: { value?: number; showSelectedPath?: boolean }) => {
  const [visible, setVisible] = React.useState<number[]>([]);
  const actions = {
    treeDropdownField: {
      addSelectedValues: vi.fn(),
      beginTreeUpdating: vi.fn(),
      updateTree: vi.fn(),
      updateTreeFailed: vi.fn(),
      setSearch: vi.fn(),
      setVisible: (id: string, path: number[]) => setVisible(path),
    },
  };
  return (
    <TreeDropdownField
      id="Form_ParentID"
      name="ParentID"
      data={{ urlTree: 'admin/tree', showSearch: true, showSelectedPath }}
      tree={tree}
      visible={visible}
      search=""
      selectedValues={value ? [{ id: 2, title: 'Documents', titlePath: showSelectedPath ? 'Documents/' : undefined }] : []}
      value={value}
      actions={actions}
      fetch={() => new Promise(() => undefined)}
      onChange={vi.fn()}
    />
  );
};

function render(value?: number, showSelectedPath?: boolean) {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(<Host value={value} showSelectedPath={showSelectedPath} />));
}

const input = () => container.querySelector<HTMLInputElement>('[role="combobox"]')!;
const active = () => document.getElementById(input().getAttribute('aria-activedescendant') ?? '');
const status = () => container.querySelector('[role="status"]')?.textContent;

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

afterEach(() => container.remove());

describe('TreeDropdownField', () => {
  it('steps into a node with Right, activating its first child and reading the level', () => {
    render();
    act(() => input().focus());
    press(input(), 'ArrowDown');
    expect(active()?.textContent).toContain('Photography');
    press(input(), 'ArrowRight');
    expect(active()?.textContent).toContain('Portraits');
    expect(status()).toBe('Photography, level 2');
  });

  it('steps back with Left to the node it left', () => {
    render();
    act(() => input().focus());
    press(input(), 'ArrowDown');
    press(input(), 'ArrowRight');
    press(input(), 'ArrowLeft');
    expect(active()?.textContent).toContain('Photography');
    expect(status()).toBe('Top level');
  });

  it('puts the back row in the tab order and returns focus to the input after it', () => {
    render();
    act(() => input().focus());
    press(input(), 'ArrowDown');
    press(input(), 'ArrowRight');
    const back = container.querySelector<HTMLButtonElement>('button.treedropdownfield__breadcrumbs')!;
    expect(back.tabIndex).toBe(0);
    act(() => back.focus());
    act(() => back.click());
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });

  it('starts an empty search when focused with a value, showing the value as the placeholder', () => {
    render(2);
    expect(input().value).toBe('Documents');
    act(() => input().focus());
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('Documents');
  });

  it('shows the selected path as the placeholder whether the list is open or closed again', () => {
    render(2, true);
    expect(input().value).toBe('Documents/');
    act(() => input().focus());
    press(input(), 'ArrowDown');
    expect(input().placeholder).toBe('Documents/');
    expect(active()?.textContent).toContain('Documents');
    expect(active()?.textContent).not.toContain('Documents/');
    press(input(), 'Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().placeholder).toBe('Documents/');
  });
});
