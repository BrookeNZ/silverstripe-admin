// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Menu, Popover } from './Popover';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const trigger = () => container.querySelector<HTMLButtonElement>('#options')!;
const panel = () => container.querySelector<HTMLElement>('#options_Popover')!;
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  });

const ActionsMenu = ({ onPublish }: { onPublish?: () => void }) => (
  <Menu id="options" label="More options for Quote">
    <Button onClick={onPublish}>Publish</Button>
    <Button>Duplicate</Button>
    <Button>Archive</Button>
  </Menu>
);

describe('Popover and Menu', () => {
  it('lines the panel up with the button end and opens below by default', () => {
    render(<ActionsMenu />);
    expect(panel().className).toBe('admin-popover__panel admin-popover__panel--end');
    expect(panel().hidden).toBe(true);
    expect(trigger().textContent).toBe('More options for Quote');
  });

  it('takes start alignment and top placement', () => {
    render(
      <Popover id="options" label="Settings" align="start" placement="top">
        <p>Fields</p>
      </Popover>,
    );
    expect(panel().className).toBe('admin-popover__panel admin-popover__panel--top');
    expect(panel().getAttribute('role')).toBe('group');
  });

  it('opens a menu on the first item and moves with the arrow, Home and End keys', () => {
    render(<ActionsMenu />);
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    act(() => trigger().click());
    expect(panel().hidden).toBe(false);
    expect(panel().getAttribute('role')).toBe('menu');
    const items = Array.from(panel().querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => [item.textContent, item.tabIndex])).toEqual([
      ['Publish', -1],
      ['Duplicate', -1],
      ['Archive', -1],
    ]);
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1], 'End');
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes on Escape and returns focus to the button', () => {
    render(<ActionsMenu />);
    act(() => trigger().click());
    key(document.activeElement!, 'Escape');
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('runs an item, then closes and returns focus to the button', () => {
    const onPublish = vi.fn();
    render(<ActionsMenu onPublish={onPublish} />);
    act(() => trigger().click());
    act(() => (document.activeElement as HTMLElement).click());
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a pointer press outside', () => {
    render(<ActionsMenu />);
    act(() => trigger().click());
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(panel().hidden).toBe(true);
  });

  it('leaves buttons outside a menu as plain buttons', () => {
    render(<Button>Save</Button>);
    expect(container.querySelector('button')?.hasAttribute('role')).toBe(false);
  });
});
