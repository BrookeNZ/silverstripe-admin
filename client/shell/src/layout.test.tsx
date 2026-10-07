// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mainId, menuId, Sidebar, SkipLink } from './layout';

vi.mock('piral-core', async (original) => ({
  ...(await original<typeof import('piral-core')>()),
  ExtensionSlot: () => null,
  useGlobalState: (select: (state: unknown) => unknown) => select({ registry: { extensions: {} } }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let navigate: NavigateFunction;

const NavigateProbe = () => {
  navigate = useNavigate();
  return null;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/pages/']}>
        <NavigateProbe />
        <SkipLink />
        <Sidebar menu={[{ code: 'pages', title: 'Pages', link: '/admin/pages/' } as never]} adminPath="/admin" />
        <main id={mainId} tabIndex={-1}>
          <button type="button">Content</button>
        </main>
      </MemoryRouter>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const toggle = () => container.querySelector<HTMLButtonElement>('.shell__menu-toggle')!;
const menu = () => document.getElementById(menuId)!;

describe('SkipLink', () => {
  it('is the first focusable element and moves focus to main without changing the URL', () => {
    const first = container.querySelector('a, button');
    expect(first?.textContent).toBe('Skip to content');
    expect(first?.getAttribute('href')).toBe(`#${mainId}`);
    const hash = window.location.hash;
    act(() => (first as HTMLAnchorElement).click());
    expect(document.activeElement?.id).toBe(mainId);
    expect(window.location.hash).toBe(hash);
  });
});

describe('Sidebar', () => {
  it('names the toggle and ties it to the menu', () => {
    expect(container.querySelector('header')).not.toBeNull();
    expect(toggle().textContent).toBe('Menu');
    expect(toggle().getAttribute('aria-controls')).toBe(menuId);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(menu().tagName).toBe('NAV');
    expect(menu().getAttribute('aria-label')).toBe('CMS sections');
  });

  it('opens and closes the menu from the toggle', () => {
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(menu().classList.contains('shell-menu--open')).toBe(true);
    expect(container.querySelector('.shell__sidebar')?.classList.contains('shell__sidebar--open')).toBe(true);
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.shell__sidebar')?.classList.contains('shell__sidebar--open')).toBe(false);
  });

  it('closes on Escape and returns focus to the toggle', () => {
    act(() => toggle().click());
    const link = menu().querySelector('a')!;
    act(() => link.focus());
    act(() => void link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('closes when focus leaves it and on a route change', () => {
    act(() => toggle().click());
    act(() => toggle().focus());
    act(() => container.querySelector<HTMLButtonElement>('main button')!.focus());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    act(() => toggle().click());
    act(() => navigate('/security/'));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
