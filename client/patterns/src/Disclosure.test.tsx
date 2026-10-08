// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure';
import { revealField } from './reveal';
import { mount, unmountAll } from './test/render';


const button = (root: HTMLElement) => root.querySelector('button') as HTMLButtonElement;
const panel = (root: HTMLElement) => root.querySelector('.admin-disclosure__panel') as HTMLElement;
const click = (element: HTMLElement) => act(() => element.click());


describe('Disclosure', () => {
  it('starts closed with a hidden panel the button controls', () => {
    const root = mount(
      <Disclosure id="Form_EditForm_Metadata" title="Metadata">
        <input id="field" />
      </Disclosure>,
    );
    expect(root.id).toBe('Form_EditForm_Metadata');
    expect(button(root).getAttribute('aria-expanded')).toBe('false');
    expect(button(root).getAttribute('aria-controls')).toBe('Form_EditForm_Metadata_panel');
    expect(panel(root).id).toBe('Form_EditForm_Metadata_panel');
    expect(panel(root).hidden).toBe(true);
    expect(panel(root).querySelector('#field')).not.toBeNull();
    expect(button(root).textContent).toBe('Metadata');
    expect(button(root).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggles open and closed, swapping the caret', () => {
    const root = mount(<Disclosure title="Metadata">content</Disclosure>);
    const closedCaret = button(root).querySelector('path')?.getAttribute('d');
    click(button(root));
    expect(button(root).getAttribute('aria-expanded')).toBe('true');
    expect(panel(root).hidden).toBe(false);
    expect(root.classList.contains('admin-disclosure--open')).toBe(true);
    expect(button(root).querySelector('path')?.getAttribute('d')).not.toBe(closedCaret);
    click(button(root));
    expect(button(root).getAttribute('aria-expanded')).toBe('false');
    expect(panel(root).hidden).toBe(true);
  });

  it('wires aria-controls to a generated panel id without a root id', () => {
    const root = mount(<Disclosure title="Metadata">content</Disclosure>);
    const controls = button(root).getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(panel(root).id).toBe(controls);
  });

  it('opens by default when asked', () => {
    const root = mount(
      <Disclosure title="Metadata" defaultOpen>
        content
      </Disclosure>,
    );
    expect(button(root).getAttribute('aria-expanded')).toBe('true');
    expect(panel(root).hidden).toBe(false);
  });

  it('puts the button inside a heading of the given level, h3 by default', () => {
    expect(mount(<Disclosure title="A">a</Disclosure>).querySelector('h3 > button')).not.toBeNull();
    unmountAll();
    expect(mount(<Disclosure title="B" headingLevel={2}>b</Disclosure>).querySelector('h2 > button')).not.toBeNull();
    unmountAll();
    expect(mount(<Disclosure title="C" headingLevel={9}>c</Disclosure>).querySelector('h6 > button')).not.toBeNull();
  });

  it('follows the open prop when controlled and reports toggles', () => {
    const onToggle = vi.fn();
    const Controlled = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <Disclosure
          title="Metadata"
          open={open}
          onToggle={(next) => {
            onToggle(next);
            setOpen(next);
          }}
        >
          content
        </Disclosure>
      );
    };
    const root = mount(<Controlled />);
    click(button(root));
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(panel(root).hidden).toBe(false);

    unmountAll();
    const fixed = mount(
      <Disclosure title="Metadata" open={false} onToggle={onToggle}>
        content
      </Disclosure>,
    );
    click(button(fixed));
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(panel(fixed).hidden).toBe(true);
  });

  it('opens when a field inside it is revealed', () => {
    const root = mount(
      <Disclosure title="Metadata">
        <input id="inside" />
      </Disclosure>,
    );
    act(() => revealField(root.querySelector('#inside') as HTMLElement));
    expect(panel(root).hidden).toBe(false);
    expect(button(root).getAttribute('aria-expanded')).toBe('true');
  });
});
