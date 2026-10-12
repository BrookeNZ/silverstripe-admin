// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { routerPath } from './routing';

describe('routerPath', () => {
  it('turns a server link under the admin root into a router path', () => {
    expect(routerPath('admin/redirects/Model/EditForm/field/Model/item/4/edit/', 'admin/')).toBe(
      '/redirects/Model/EditForm/field/Model/item/4/edit/',
    );
    expect(routerPath('/admin/security/?q=1', '/admin/')).toBe('/security/?q=1');
    expect(routerPath('admin', 'admin/')).toBe('/');
  });

  it('leaves links outside the admin root alone', () => {
    expect(routerPath('https://example.com/admin/pages/', 'admin/')).toBeNull();
    expect(routerPath('administrator/', 'admin/')).toBeNull();
    expect(routerPath('about-us/', 'admin/')).toBeNull();
  });
});
