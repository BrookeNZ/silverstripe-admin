// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTopBar, TopBar } from './TopBar';
import type { TopBarData } from './TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data: TopBarData = {
  siteName: 'Example site',
  siteUrl: 'https://example.test/',
  applicationName: 'Silverstripe',
  applicationLink: '//www.silverstripe.org/',
  member: { name: 'Ada Lovelace', profileUrl: '/admin/myprofile' },
  logoutUrl: '/Security/logout/?BackURL=admin%2F',
  helpLinks: [
    { title: 'CMS User help', url: 'https://userhelp.silverstripe.org/en/6/' },
    { title: 'Developer docs', url: 'https://docs.silverstripe.org/en/6/' },
  ],
};

let container: HTMLDivElement;
let root: Root;

const render = (topBar: TopBarData) =>
  act(() =>
    root.render(
      <MemoryRouter>
        <TopBar
          data={topBar}
          menuId="menu"
          menuOpen={false}
          onMenuToggle={() => undefined}
          toggleRef={{ current: null }}
          onKeyDown={() => undefined}
          onBlur={() => undefined}
        />
      </MemoryRouter>,
    ),
  );

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const trigger = (name: string) => [...container.querySelectorAll('button')].find((button) => button.textContent === name)!;
const panel = (name: string) => document.getElementById(trigger(name).getAttribute('aria-controls')!)!;

describe('TopBar', () => {
  it('links the logo to the application and the site name to the site, each in a new tab', () => {
    render(data);
    const logo = container.querySelector<HTMLAnchorElement>('.shell-top-bar__logo')!;
    expect([logo.getAttribute('href'), logo.target, logo.getAttribute('aria-label')]).toEqual(['//www.silverstripe.org/', '_blank', 'Silverstripe']);
    const site = container.querySelector<HTMLAnchorElement>('.shell-top-bar__site-name')!;
    expect([site.textContent, site.getAttribute('href'), site.target]).toEqual(['Example site', 'https://example.test/', '_blank']);
    expect(container.querySelector('.shell-top-bar__badge')?.textContent).toBe('Piral shell');
  });

  it('lists the help links as menu items that open in a new tab', () => {
    render(data);
    const items = [...panel('Help').querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
    expect(items.map((item) => [item.textContent, item.getAttribute('href'), item.target, item.rel])).toEqual([
      ['CMS User help', 'https://userhelp.silverstripe.org/en/6/', '_blank', 'noopener noreferrer'],
      ['Developer docs', 'https://docs.silverstripe.org/en/6/', '_blank', 'noopener noreferrer'],
    ]);
  });

  it('offers the profile and log out in the person menu named by the member', () => {
    render(data);
    expect(trigger('Ada Lovelace').getAttribute('aria-haspopup')).toBe('menu');
    act(() => trigger('Ada Lovelace').click());
    const items = [...panel('Ada Lovelace').querySelectorAll('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(['Profile', 'Log out']);
  });

  it('drops the help menu when there are no help links', () => {
    render({ ...data, helpLinks: [] });
    expect(trigger('Help')).toBeUndefined();
    expect(trigger('Ada Lovelace')).toBeDefined();
  });

  it('reads its data from the shell root and falls back when it is missing or broken', () => {
    const root = document.createElement('div');
    root.dataset.topBar = JSON.stringify(data);
    expect(readTopBar(root)).toEqual(data);
    root.dataset.topBar = '{';
    expect(readTopBar(root).helpLinks).toEqual([]);
    expect(readTopBar(null).member).toBeNull();
  });
});
