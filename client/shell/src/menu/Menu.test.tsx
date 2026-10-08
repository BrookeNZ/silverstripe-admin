// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PiralCore from 'piral-core';
import { PagesIcon, SectionIcon, SecurityIcon } from '@silverstripe/admin-patterns';
import type { SilverstripeMenuItem } from '../silverstripe';
import { silverstripePlugin } from '../test/silverstripePlugin';
import { menuCollapsedKey, useMenuCollapsed } from './collapse';
import { Menu } from './Menu';
import { legacySectionIcon } from './sectionIcons';

// Piral's own registry needs the app codegen a piral build produces, so a map stands in for it
const extensions = vi.hoisted((): Record<string, Array<{ reference: unknown }>> => ({}));

vi.mock('piral-core', async (original) => ({
  ...(await original<typeof PiralCore>()),
  ExtensionSlot: ({ empty }: { empty?: () => React.ReactNode }) => <>{empty?.()}</>,
  useGlobalState: (select: (state: unknown) => unknown) => select({ registry: { extensions: { ...extensions } } }),
}));

function piletApi() {
  const context = { on() {}, readState: () => [] };
  const shellApi = {
    registerExtension(slot: string, reference: unknown) {
      extensions[slot] = [...(extensions[slot] ?? []), { reference }];
      return () => {
        extensions[slot] = extensions[slot].filter((registration) => registration.reference !== reference);
      };
    },
  };
  return silverstripePlugin(context)(shellApi, { name: 'hello' });
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const menu: Array<SilverstripeMenuItem> = [
  { code: 'pages', title: 'Pages', link: '/admin/pages/', iconClass: 'font-icon-sitemap', current: false },
];

let container: HTMLDivElement;
let root: Root;

const Harness = ({ path = '/pages/' }: { path?: string }) => {
  const [collapsed, setCollapsed] = useMenuCollapsed();
  return (
    <MemoryRouter initialEntries={[path]}>
      <Menu id="menu" menu={menu} adminPath="/admin" open={false} collapsed={collapsed} onCollapsedChange={setCollapsed} />
    </MemoryRouter>
  );
};

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Menu', () => {
  it('maps the legacy font icon class to a section icon, with a generic fallback', () => {
    expect(legacySectionIcon('font-icon-sitemap')).toBe(PagesIcon);
    expect(legacySectionIcon('extra font-icon-torsos-all')).toBe(SecurityIcon);
    expect(legacySectionIcon('font-icon-database')).toBe(SectionIcon);
    expect(legacySectionIcon('')).toBe(SectionIcon);
  });

  it('collapses and expands, remembering the state and keeping the label as the link name', () => {
    const nav = () => container.querySelector('nav')!;
    const button = () => container.querySelector<HTMLButtonElement>('.shell-menu__collapse')!;
    act(() => root.render(<Harness />));
    act(() => button().click());
    expect(nav().classList.contains('shell-menu--collapsed')).toBe(true);
    expect(button().textContent).toBe('Expand menu');
    expect(container.querySelector('.shell-menu__link')?.textContent).toBe('Pages');
    expect(window.localStorage.getItem(menuCollapsedKey)).toBe('1');

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness />));
    expect(nav().classList.contains('shell-menu--collapsed')).toBe(true);
    act(() => button().click());
    expect(nav().classList.contains('shell-menu--collapsed')).toBe(false);
    expect(window.localStorage.getItem(menuCollapsedKey)).toBeNull();
  });

  it('draws a pilet menu item like a section item, current on its sub paths, until it is disposed', () => {
    const dispose = piletApi().registerMenuItem({ code: 'hello', label: 'Hello', to: '/hello' });
    act(() => root.render(<Harness path="/hello/greeting" />));
    const links = () => [...container.querySelectorAll<HTMLAnchorElement>('.shell-menu__item > .shell-menu__link')];
    const [section, hello] = links();
    expect(hello.getAttribute('href')).toBe('/hello');
    expect(hello.getAttribute('aria-current')).toBe('page');
    expect(section.getAttribute('aria-current')).toBeNull();
    expect(hello.title).toBe('Hello');
    expect(hello.querySelector('.shell-menu__icon svg')).not.toBeNull();
    expect(hello.querySelector('.shell-menu__label')?.textContent).toBe('Hello');

    dispose();
    act(() => root.render(<Harness path="/pages/" />));
    expect(links()).toHaveLength(1);
  });
});
