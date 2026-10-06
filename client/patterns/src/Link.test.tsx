// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Link } from './Link';
import type { LinkRenderProps } from './Link';
import { BackIcon, ForwardIcon } from './icons';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

function render(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
  return container.firstElementChild as HTMLElement;
}

afterEach(() => container.remove());

describe('Link', () => {
  it('renders an anchor by default, passing anchor attributes through', () => {
    const link = render(
      <Link href="/admin/pages" className="extra" title="Pages" data-test="x">
        Pages
      </Link>,
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/pages');
    expect(link.className).toBe('admin-link extra');
    expect(link.title).toBe('Pages');
    expect(link.dataset.test).toBe('x');
    expect(link.hasAttribute('target')).toBe(false);
  });

  it('renders through an injected link component', () => {
    const RouterLink = React.forwardRef<HTMLAnchorElement, Omit<LinkRenderProps, 'href' | 'ref'> & { to: string }>(
      ({ to, ...props }, ref) => <a {...props} ref={ref} data-router-to={to} />,
    );
    const link = render(
      <Link href="/pages/edit/1" renderLink={({ href, ...props }) => <RouterLink {...props} to={href} />}>
        Edit
      </Link>,
    );
    expect(link.dataset.routerTo).toBe('/pages/edit/1');
    expect(link.className).toBe('admin-link');
    expect(link.textContent).toBe('Edit');
  });

  it('places the icon after the label by default and before it on request', () => {
    const end = render(
      <Link href="/next" icon={<ForwardIcon />}>
        Next
      </Link>,
    );
    expect(end.className).toBe('admin-link admin-link--icon');
    expect(end.firstChild?.textContent).toBe('Next');
    expect(end.lastElementChild?.tagName).toBe('svg');
    expect(end.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
    container.remove();

    const start = render(
      <Link href="/back" icon={<BackIcon />} iconPosition="start">
        Back
      </Link>,
    );
    expect(start.firstElementChild?.tagName).toBe('svg');
    expect(start.lastChild?.textContent).toBe('Back');
  });

  it('opens an external link in a new window and says so in hidden text', () => {
    const link = render(
      <Link href="https://example.com" external renderLink={() => <span />}>
        Example
      </Link>,
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const hidden = link.querySelector('.admin-link__hidden');
    expect(hidden?.textContent).toBe(' (opens in new window)');
    expect(link.textContent).toBe('Example (opens in new window)');
  });

  it('forwards its ref to the anchor, injected or not', () => {
    const plain = React.createRef<HTMLAnchorElement>();
    render(
      <Link href="/a" ref={plain}>
        A
      </Link>,
    );
    expect(plain.current?.tagName).toBe('A');
    container.remove();

    const injected = React.createRef<HTMLAnchorElement>();
    render(
      <Link href="/b" ref={injected} renderLink={(props) => <a {...props} data-injected="" />}>
        B
      </Link>,
    );
    expect(injected.current?.dataset.injected).toBe('');
  });
});
