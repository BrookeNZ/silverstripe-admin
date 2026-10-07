// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chrome, Content, mainId, menuId, SkipLink } from './layout';
import type { SectionHeader } from './header/state';
import type { SectionSidebarSlotProps } from './header/SectionSidebar';
import { sectionSidebarCollapsedKey } from './header/SectionSidebar';
import { resetPreviewMode, setPreviewMode } from './preview/mode';
import { readTopBar } from './topbar/TopBar';

const shellState = vi.hoisted(() => ({
  current: { registry: { extensions: {} }, sectionHeader: { current: null, entries: [] as Array<unknown> } },
}));

const slot = vi.hoisted(() => ({ params: null as unknown }));

vi.mock('piral-core', async (original) => ({
  ...(await original<typeof import('piral-core')>()),
  ExtensionSlot: ({ name, params }: { name: string; params?: unknown }) => {
    slot.params = params;
    return <span data-slot={name} />;
  },
  useGlobalState: (select: (state: unknown) => unknown) => select(shellState.current),
}));

vi.mock('./preview/PreviewPane', () => ({ PreviewPane: () => <div className="probe-preview" /> }));

function showHeader(header: SectionHeader | null) {
  shellState.current = {
    ...shellState.current,
    sectionHeader: { current: header, entries: header ? [{ header, id: 1, owner: 'test' }] : [] },
  };
}

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
        <Chrome
          menu={[{ code: 'pages', title: 'Pages', link: '/admin/pages/' } as never]}
          adminPath="/admin"
          topBar={readTopBar(null)}
        />
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

const toggle = () => container.querySelector<HTMLButtonElement>('.shell-top-bar__menu-toggle')!;
const topBarOpen = () => container.querySelector('.shell-top-bar')!.classList.contains('shell-top-bar--menu-open');
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

describe('Chrome', () => {
  it('names the top bar\'s toggle and ties it to the menu in the sidebar', () => {
    expect(container.querySelector('header')?.className).toBe('shell-top-bar');
    expect(container.querySelector('.shell__sidebar')?.contains(menu())).toBe(true);
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
    expect(topBarOpen()).toBe(true);
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(topBarOpen()).toBe(false);
    expect(menu().classList.contains('shell-menu--open')).toBe(false);
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

describe('Content', () => {
  let contentContainer: HTMLDivElement;
  let contentRoot: Root;
  const pagesCode = 'SilverStripe-CMS-Controllers-CMSMain';

  const renderContent = () =>
    act(() =>
      contentRoot.render(
        <MemoryRouter initialEntries={['/pages/']}>
          <Content>
            <p className="probe-page">Page</p>
          </Content>
        </MemoryRouter>,
      ),
    );

  let wide = true;

  beforeEach(() => {
    wide = true;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: wide, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
    );
    contentContainer = document.createElement('div');
    document.body.append(contentContainer);
    contentRoot = createRoot(contentContainer);
  });

  afterEach(() => {
    act(() => contentRoot.unmount());
    contentContainer.remove();
    showHeader(null);
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetPreviewMode();
  });

  const main = () => contentContainer.querySelector('main')!;

  it('draws the header over the page in one column without a sidebar', () => {
    showHeader({ title: 'Security' });
    renderContent();
    expect(main().className).toBe('shell__content');
    expect(contentContainer.querySelector('.shell-section-sidebar')).toBeNull();
    const column = main().querySelector('.shell__column')!;
    expect(column.querySelector('h1')?.textContent).toBe('Security');
    expect(column.querySelector('.probe-page')).not.toBeNull();
  });

  it('draws the sidebar column before the header and page when the header names one', () => {
    showHeader({ title: 'Home', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    expect(main().classList.contains('shell__content--split')).toBe(true);
    const [sidebar, column] = [...main().children];
    expect(sidebar.className).toBe('shell-section-sidebar');
    expect(column.className).toBe('shell__column');
    expect(sidebar.querySelector('.shell-section-sidebar__title')?.textContent).toBe('Pages');
    expect(sidebar.querySelector('button')?.textContent).toBe('Search Pages');
    expect(sidebar.querySelector('[data-slot]')?.getAttribute('data-slot')).toBe(`silverstripe:section-sidebar:${pagesCode}`);
    expect(sidebar.querySelector('h1')).toBeNull();
    expect(column.querySelector('h1')?.textContent).toBe('Home');
  });

  it('keeps the page mounted when the header adds and drops the sidebar', () => {
    showHeader({ title: 'Pages' });
    renderContent();
    const page = contentContainer.querySelector('.probe-page');
    showHeader({ title: 'Pages', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    expect(contentContainer.querySelector('.shell-section-sidebar')).not.toBeNull();
    expect(contentContainer.querySelector('.probe-page')).toBe(page);
    showHeader({ title: 'Pages' });
    renderContent();
    expect(contentContainer.querySelector('.shell-section-sidebar')).toBeNull();
    expect(contentContainer.querySelector('.probe-page')).toBe(page);
  });

  const sidebar = () => contentContainer.querySelector<HTMLElement>('.shell-section-sidebar')!;
  const button = (name: string) =>
    [...sidebar().querySelectorAll('button')].find((candidate) => candidate.textContent === name)!;
  const params = () => slot.params as SectionSidebarSlotProps;

  it('names the sidebar with a plain title so the page h1 is the first heading', () => {
    showHeader({ title: 'Home', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    const title = sidebar().querySelector('.shell-section-sidebar__title')!;
    expect(title.tagName).toBe('SPAN');
    expect(title.id).toBe(params().titleId);
    expect(main().querySelector('h1, h2, h3, h4, h5, h6')?.tagName).toBe('H1');
  });

  it('keeps the sidebar first in source when the viewport is narrow, collapsed until opened', () => {
    wide = false;
    showHeader({ title: 'Home', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    expect(main().firstElementChild).toBe(sidebar());
    expect(sidebar().classList.contains('shell-section-sidebar--collapsed')).toBe(true);
    expect(sidebar().querySelector<HTMLElement>('.shell-section-sidebar__body')!.hidden).toBe(true);
    act(() => button('Expand Pages').click());
    expect(sidebar().classList.contains('shell-section-sidebar--collapsed')).toBe(false);
    expect(window.localStorage.getItem(sectionSidebarCollapsedKey)).toBeNull();
  });

  it('hides the sidebar in preview mode without unmounting it', () => {
    const preview = 'https://example.test/?CMSPreview=1';
    showHeader({ title: 'Home', preview, sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    const drawn = sidebar();
    act(() => setPreviewMode('preview'));
    expect(sidebar()).toBe(drawn);
    expect(drawn.classList.contains('shell-section-sidebar--hidden')).toBe(true);
    expect(main().classList.contains('shell__content--split')).toBe(false);
    act(() => setPreviewMode('split'));
    expect(drawn.classList.contains('shell-section-sidebar--hidden')).toBe(false);
    expect(main().classList.contains('shell__content--split')).toBe(true);
  });

  it('opens the search from the header button and returns focus when the body closes it', () => {
    showHeader({ title: 'Home', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    const search = button('Search Pages');
    expect(search.getAttribute('aria-controls')).toBe(params().searchId);
    expect([search.getAttribute('aria-expanded'), params().searchOpen]).toEqual(['false', false]);
    act(() => search.click());
    expect([search.getAttribute('aria-expanded'), params().searchOpen]).toEqual(['true', true]);
    act(() => params().closeSearch());
    expect([search.getAttribute('aria-expanded'), params().searchOpen]).toEqual(['false', false]);
    expect(document.activeElement).toBe(search);
    act(() => search.click());
    act(() => search.click());
    expect(params().searchOpen).toBe(false);
  });

  it('collapses to the rail and remembers it, or keeps it in memory when storage throws', () => {
    showHeader({ title: 'Home', sidebar: { title: 'Pages', section: pagesCode } });
    renderContent();
    act(() => button('Collapse Pages').click());
    expect(sidebar().classList.contains('shell-section-sidebar--collapsed')).toBe(true);
    expect(button('Expand Pages').getAttribute('aria-expanded')).toBe('false');
    expect(window.localStorage.getItem(sectionSidebarCollapsedKey)).toBe('1');
    act(() => button('Expand Pages').click());

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    act(() => contentRoot.unmount());
    contentRoot = createRoot(contentContainer);
    renderContent();
    expect(sidebar().classList.contains('shell-section-sidebar--collapsed')).toBe(false);
    act(() => button('Collapse Pages').click());
    expect(sidebar().classList.contains('shell-section-sidebar--collapsed')).toBe(true);
  });
});
