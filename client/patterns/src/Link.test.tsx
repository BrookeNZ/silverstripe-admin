// @vitest-environment happy-dom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Link } from './Link';
import type { LinkRenderProps } from './Link';
import { BackIcon, ForwardIcon } from './icons';
import { mount, unmountAll } from './test/render';



describe('Link', () => {
  it('renders an anchor by default, passing anchor attributes through', () => {
    const link = mount(
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
    const RouterLink = ({ to, children, ...props }: Omit<LinkRenderProps, 'href'> & { to: string }) => (
      <a {...props} data-router-to={to}>
        {children}
      </a>
    );
    const link = mount(
      <Link href="/pages/edit/1" renderLink={({ href, ...props }) => <RouterLink {...props} to={href} />}>
        Edit
      </Link>,
    );
    expect(link.dataset.routerTo).toBe('/pages/edit/1');
    expect(link.className).toBe('admin-link');
    expect(link.textContent).toBe('Edit');
  });

  it('places the icon after the label by default and before it on request', () => {
    const end = mount(
      <Link href="/next" icon={<ForwardIcon />}>
        Next
      </Link>,
    );
    expect(end.className).toBe('admin-link admin-link--icon');
    expect(end.firstChild?.textContent).toBe('Next');
    expect(end.lastElementChild?.tagName).toBe('svg');
    expect(end.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
    unmountAll();

    const start = mount(
      <Link href="/back" icon={<BackIcon />} iconPosition="start">
        Back
      </Link>,
    );
    expect(start.firstElementChild?.tagName).toBe('svg');
    expect(start.lastChild?.textContent).toBe('Back');
  });

  it('opens an external link in a new window and says so in hidden text', () => {
    const link = mount(
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
    mount(
      <Link href="/a" ref={plain}>
        A
      </Link>,
    );
    expect(plain.current?.tagName).toBe('A');
    unmountAll();

    const injected = React.createRef<HTMLAnchorElement>();
    mount(
      <Link href="/b" ref={injected} renderLink={({ children, ...props }) => <a {...props} data-injected="">{children}</a>}>
        B
      </Link>,
    );
    expect(injected.current?.dataset.injected).toBe('');
  });
});
