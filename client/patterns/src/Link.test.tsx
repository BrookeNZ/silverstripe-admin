// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Link } from './Link';
import type { LinkRenderProps } from './Link';
import { mount } from './test/render';



describe('Link', () => {
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

  it('opens an external link in a new window and says so in hidden text', () => {
    const link = mount(
      <Link href="https://example.com" external renderLink={() => <span />}>
        Example
      </Link>,
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const hidden = link.querySelector('.admin-visually-hidden');
    expect(hidden?.textContent).toBe(' (opens in new window)');
    expect(link.textContent).toBe('Example (opens in new window)');
  });
});
