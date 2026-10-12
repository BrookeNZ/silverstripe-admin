// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { StateContext } from 'piral-core';
import type { GlobalStateContext } from 'piral-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer } from '../announcer';
import { applicationName, documentTitle, keptHeaderDelay, SectionHeaderBar } from './SectionHeader';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import { setSectionHeader } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let context: GlobalStateContext;
let navigate: NavigateFunction;

const NavigateProbe = () => {
  navigate = useNavigate();
  return null;
};

const frame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
const title = () => container.querySelector('h1');

/** Real timers under a loaded test run can lag, so poll in short act-wrapped waits */
async function until(done: () => boolean, timeout = 3000) {
  for (let waited = 0; waited < timeout && !done(); waited += 50) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  }
}
const announced = () => container.querySelector('[role="status"]')?.textContent;

beforeEach(async () => {
  document.title = 'Silverstripe - Pages';
  context = fakeGlobalContext();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <StateContext value={context}>
        <MemoryRouter initialEntries={['/pages/']}>
          <NavigateProbe />
          <button type="button">Menu link</button>
          <SectionHeaderBar />
          <LiveAnnouncer />
        </MemoryRouter>
      </StateContext>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('document title', () => {
  it('takes the application name from the server title', () => {
    expect(applicationName('Silverstripe - Pages')).toBe('Silverstripe');
    expect(applicationName('')).toBe('Silverstripe');
  });

  it('names the record or section first', () => {
    expect(documentTitle({ title: 'Home' }, 'Silverstripe')).toBe('Home - Silverstripe');
    expect(documentTitle({ title: 'Home', documentTitle: 'Home settings' }, 'Silverstripe')).toBe('Home settings - Silverstripe');
  });
});

describe('SectionHeaderBar', () => {
  it('titles the document from the header without moving focus on the first load', async () => {
    const menuLink = container.querySelector('button')!;
    menuLink.focus();
    act(() => {
      setSectionHeader(context, 'shell', { title: 'Pages' });
    });
    await frame();
    expect(document.title).toBe('Pages - Silverstripe');
    expect(document.activeElement).toBe(menuLink);
    expect(title()?.getAttribute('tabindex')).toBe('-1');
  });

  it('waits for the arriving page to set its header', async () => {
    container.querySelector('button')!.focus();
    await act(async () => navigate('/security/'));
    await frame();
    expect(title()).toBeNull();
    act(() => {
      setSectionHeader(context, 'shell', { title: 'Security' });
    });
    await frame();
    expect(document.activeElement).toBe(title());
  });

  it('focuses and announces the arriving header after a route change, not the one it replaces', async () => {
    let dispose = () => undefined as void;
    act(() => {
      dispose = setSectionHeader(context, 'shell', { title: 'Pages' });
    });
    await act(async () => navigate('/security/'));
    await act(async () => {
      dispose();
      setSectionHeader(context, 'shell', { title: 'Security' });
    });
    await frame();
    await until(() => announced() === 'Security');
    expect(announced()).toBe('Security');
    expect(document.activeElement).toBe(title());
    expect(title()?.textContent).toBe('Security');
    expect(document.title).toBe('Security - Silverstripe');
  });

  it('focuses a header the route change kept after a short wait', async () => {
    act(() => {
      setSectionHeader(context, 'shell', { title: 'Pages' });
    });
    container.querySelector('button')!.focus();
    await act(async () => navigate('/pages/edit/show/1'));
    await frame();
    expect(document.activeElement).not.toBe(title());
    await until(() => document.activeElement === title(), keptHeaderDelay * 5);
    expect(document.activeElement).toBe(title());
  });

  it('announces the title a record page settles on', async () => {
    let dispose = () => undefined as void;
    await act(async () => navigate('/security/users/item/1'));
    act(() => {
      dispose = setSectionHeader(context, 'shell', { title: 'Users #1' });
    });
    await frame();
    await act(async () => {
      dispose();
      setSectionHeader(context, 'shell', { title: 'Default Admin' });
    });
    await until(() => announced() === 'Default Admin');
    expect(announced()).toBe('Default Admin');
    expect(document.activeElement).toBe(title());
  });
});

describe('SectionHeader crumbs', () => {
  it('lists the ancestors as links above the title, without the current page', async () => {
    await act(async () => {
      setSectionHeader(context, 'pages', {
        title: 'Careers',
        crumbs: [
          { label: 'Home', to: '/pages/edit/show/1' },
          { label: 'About us', to: '/pages/edit/show/2' },
        ],
      });
    });
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
    const links = [...(nav?.querySelectorAll('ol > li > a') ?? [])];
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/pages/edit/show/1'],
      ['About us', '/pages/edit/show/2'],
    ]);
    expect(nav?.textContent).not.toContain('Careers');
    expect(title()?.textContent).toBe('Careers');
    const back = container.querySelector('.shell-header__back');
    expect(back?.getAttribute('href')).toBe('/pages/edit/show/2');
    expect(back?.getAttribute('aria-label')).toBe('Back to About us');
  });

  it('draws no breadcrumb without crumbs', async () => {
    await act(async () => {
      setSectionHeader(context, 'pages', { title: 'Pages' });
    });
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    expect(container.querySelector('.shell-header__back')).toBeNull();
  });
});

describe('SectionHeader badge', () => {
  it('draws the badge beside the title as its description, outside its name', async () => {
    await act(async () => {
      setSectionHeader(context, 'elemental', { title: 'Get the most out of Silverstripe CMS', badge: 'Feature column block' });
    });
    const badge = container.querySelector('.shell-header__badge');
    expect(badge?.textContent).toBe('Feature column block');
    expect(title()?.textContent).toBe('Get the most out of Silverstripe CMS');
    expect(title()?.getAttribute('aria-describedby')).toBe(badge?.id);
  });
});

describe('SectionHeader preview', () => {
  it('leaves the preview controls to the action bar', async () => {
    await act(async () => {
      setSectionHeader(context, 'pages', { title: 'About', preview: 'https://example.test/about/' });
    });
    expect(title()?.textContent).toBe('About');
    expect(container.querySelector('#shell-preview-mode')).toBeNull();
    expect(container.textContent).not.toContain('Share');
  });
});

describe('SectionHeader sidebar', () => {
  it('draws the same header with or without a sidebar, leaving the sidebar title to the layout', async () => {
    await act(async () => {
      setSectionHeader(context, 'pages', {
        title: 'Home',
        backTo: '/pages/',
        sidebar: { title: 'Pages', section: 'SilverStripe-CMS-Controllers-CMSMain' },
      });
    });
    const withSidebar = container.querySelector('.shell-header')?.outerHTML;
    expect(title()?.textContent).toBe('Home');
    expect(container.querySelector('h2')).toBeNull();
    expect(container.textContent).not.toContain('Pages');
    await act(async () => {
      setSectionHeader(context, 'pages', { title: 'Home', backTo: '/pages/' });
    });
    expect(container.querySelector('.shell-header')?.outerHTML).toBe(withSidebar);
  });
});
