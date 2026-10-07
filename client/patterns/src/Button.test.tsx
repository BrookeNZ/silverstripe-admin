// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { SearchIcon } from './icons';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

function render(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container.firstElementChild as HTMLElement;
}

afterEach(() => container.remove());

describe('Button', () => {
  it('renders a non-submitting button by default, as the outlined secondary', () => {
    const button = render(<Button>Save</Button>);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('admin-button');
    expect(button.textContent).toBe('Save');
  });

  it('renders a link when given href, with the variant modifier and native attributes', () => {
    const link = render(
      <Button href="/admin/new" variant="primary" className="extra" data-test="x">
        Add new
      </Button>,
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/new');
    expect(link.className).toBe('admin-button admin-button--primary extra');
    expect(link.dataset.test).toBe('x');
  });

  it('places the icon before the label by default and after it on request', () => {
    const start = render(<Button icon={<SearchIcon />}>Search</Button>);
    expect(start.firstElementChild?.tagName).toBe('svg');
    expect(start.lastElementChild?.tagName).toBe('SPAN');
    container.remove();

    const end = render(
      <Button icon={<SearchIcon />} iconPosition="end">
        Search
      </Button>,
    );
    expect(end.firstElementChild?.tagName).toBe('SPAN');
    expect(end.lastElementChild?.tagName).toBe('svg');
  });

  it('keeps an icon-only label as visually hidden text and hides the icon from assistive technology', () => {
    const button = render(
      <Button variant="tertiary" iconOnly icon={<SearchIcon />}>
        Search
      </Button>,
    );
    expect(button.className).toBe('admin-button admin-button--tertiary admin-button--icon-only');
    expect(button.querySelector('span')?.className).toBe('admin-button__label--hidden');
    expect(button.textContent).toBe('Search');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });

  it('draws a text button as a link while keeping it a button', () => {
    const button = render(<Button variant="text">Delete</Button>) as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.className).toBe('admin-button admin-button--text');
  });

  it('disables a button while disabled, and drops the href of a disabled link', () => {
    expect((render(<Button disabled>Save</Button>) as HTMLButtonElement).disabled).toBe(true);
    container.remove();

    const link = render(
      <Button href="/admin/new" disabled>
        Add new
      </Button>,
    );
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.tabIndex).toBe(-1);
  });

  it('keeps focus when loading starts, and swallows clicks while loading', () => {
    const onClick = vi.fn();
    const root = document.createElement('div');
    document.body.append(root);
    container = root as HTMLDivElement;
    const reactRoot = createRoot(root);
    act(() => reactRoot.render(<Button onClick={onClick}>Save</Button>));
    const button = root.firstElementChild as HTMLButtonElement;
    button.focus();

    act(() =>
      reactRoot.render(
        <Button onClick={onClick} loading>
          Save
        </Button>,
      ),
    );
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('takes a disabled or loading link out of the tab order and swallows its clicks', () => {
    for (const props of [{ disabled: true }, { loading: true }]) {
      const onClick = vi.fn();
      const link = render(
        <Button href="/admin/new" onClick={onClick} {...props}>
          Add new
        </Button>,
      );
      expect(link.hasAttribute('href')).toBe(false);
      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.tabIndex).toBe(-1);
      act(() => link.click());
      expect(onClick).not.toHaveBeenCalled();
      container.remove();
    }
    container = document.createElement('div');
  });

  it('names an icon-only button by aria-label when it has no text, and warns when it has neither', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const button = render(<Button iconOnly icon={<SearchIcon />} aria-label="Search" />);
    expect(button.getAttribute('aria-label')).toBe('Search');
    expect(button.querySelector('span')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    container.remove();

    render(<Button iconOnly icon={<SearchIcon />} aria-label=" " />);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();

    // @ts-expect-error an icon-only button needs aria-label or children
    void (<Button iconOnly icon={<SearchIcon />} />);
  });

  it('submits when asked, carrying its name and value', () => {
    const button = render(
      <Button type="submit" name="action_save" value="1">
        Save
      </Button>,
    ) as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.name).toBe('action_save');
    expect(button.value).toBe('1');
  });

  it('forwards its ref to the rendered element', () => {
    const buttonRef = React.createRef<HTMLButtonElement | HTMLAnchorElement>();
    render(<Button ref={buttonRef}>Save</Button>);
    expect(buttonRef.current?.tagName).toBe('BUTTON');
    container.remove();

    const linkRef = React.createRef<HTMLButtonElement | HTMLAnchorElement>();
    render(
      <Button ref={linkRef} href="/admin">
        Home
      </Button>,
    );
    expect(linkRef.current?.tagName).toBe('A');
  });
});

describe('icons', () => {
  it('names a standalone icon when given a label', () => {
    const svg = render(<SearchIcon label="Search" size="sm" />);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Search');
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
    expect(svg.getAttribute('class')).toBe('admin-icon admin-icon--sm');
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });
});
