// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { StateContext } from 'piral-core';
import type { GlobalState, GlobalStateContext } from 'piral-core';
import create from 'zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer } from '../announcer';
import { applicationName, documentTitle, keptHeaderDelay, SectionHeaderBar } from './SectionHeader';
import { initialSectionHeader, setSectionHeader } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeContext(): GlobalStateContext {
  const store = create<GlobalState>(() => ({ sectionHeader: initialSectionHeader }) as unknown as GlobalState);
  return {
    state: store,
    dispatch: (update: (state: GlobalState) => GlobalState) => store.setState(update(store.getState()), true),
    readState: <S,>(select: (state: GlobalState) => S) => select(store.getState()),
  } as unknown as GlobalStateContext;
}

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
  context = fakeContext();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <StateContext.Provider value={context}>
        <MemoryRouter initialEntries={['/pages/']}>
          <NavigateProbe />
          <button type="button">Menu link</button>
          <SectionHeaderBar />
          <LiveAnnouncer />
        </MemoryRouter>
      </StateContext.Provider>,
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
    act(() => void setSectionHeader(context, 'shell', { title: 'Pages' }));
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
    act(() => void setSectionHeader(context, 'shell', { title: 'Security' }));
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
    act(() => void setSectionHeader(context, 'shell', { title: 'Pages' }));
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
