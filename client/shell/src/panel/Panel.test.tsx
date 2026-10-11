// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StateContext } from 'piral-core';
import type { PiletApi, PiletMetadata } from 'piral-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSilverstripeApi } from '../api/silverstripe';
import { Workspace } from '../layout';
import { fakeGlobalContext } from '../test/fakeGlobalContext';
import type { FakeGlobalContext } from '../test/fakeGlobalContext';
import { panelBesideQuery } from './Panel';
import { closePanel, initialPanel, openPanel } from './state';
import type { PanelOptions } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let context: FakeGlobalContext;
let wide: boolean;

const panel = () => container.querySelector<HTMLElement>('.shell-panel');
const heading = () => container.querySelector<HTMLElement>('.shell-panel__title');
const opener = () => container.querySelector<HTMLButtonElement>('#opener');

const options = (overrides: Partial<PanelOptions> = {}): PanelOptions => ({
  id: 'file-19',
  title: 'Card illustration',
  badge: 'Draft',
  meta: ['1120 x 640px', '13 KB'],
  content: <p>Fields</p>,
  onClose: vi.fn(),
  ...overrides,
});

async function open(panelOptions: PanelOptions, owner = 'files') {
  let dispose: () => void = () => undefined;
  await act(async () => {
    dispose = openPanel(context, owner, panelOptions);
  });
  return async () => {
    await act(async () => {
      dispose();
      await Promise.resolve();
    });
  };
}

beforeEach(async () => {
  wide = true;
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === panelBesideQuery ? wide : false;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  context = fakeGlobalContext({ panel: initialPanel });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <StateContext value={context}>
        <MemoryRouter>
          <main tabIndex={-1}>
            <h1 tabIndex={-1} id="section-title">
              Files
            </h1>
            <Workspace>
              <button type="button" id="opener">
                Open
              </button>
              <p className="probe-content">The list</p>
            </Workspace>
          </main>
        </MemoryRouter>
      </StateContext>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('details panel', () => {
  it('opens with its title as the region name, the badge and meta, and focus on the title', async () => {
    opener()?.focus();
    await open(options());
    const region = panel();
    expect(region?.tagName).toBe('SECTION');
    expect(region?.getAttribute('aria-labelledby')).toBe(heading()?.id);
    expect(heading()?.textContent).toBe('Card illustration');
    expect(container.querySelector('.admin-badge')?.textContent).toBe('Draft');
    expect(container.querySelector('.shell-panel__meta')?.textContent).toBe('1120 x 640px13 KB');
    expect(container.querySelector('.shell-panel__body')?.textContent).toBe('Fields');
    expect(document.activeElement).toBe(heading());
    expect(container.querySelector('button[aria-label="Close Card illustration"]')).not.toBeNull();
  });

  it('asks to close from the close button only, not from Escape, as legacy had no Escape', async () => {
    const onClose = vi.fn();
    await open(options({ onClose, content: <input aria-label="Title" /> }));
    act(() => {
      container.querySelector('input[aria-label="Title"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLButtonElement>('.shell-panel__close')?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes through the disposer and closePanel without calling onClose, and returns focus to the opener', async () => {
    const onClose = vi.fn();
    opener()?.focus();
    const dispose = await open(options({ onClose }));
    expect(document.activeElement).toBe(heading());
    await dispose();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener());

    await open(options({ onClose }));
    await act(async () => closePanel(context, 'other-pilet', 'file-19'));
    expect(panel()).not.toBeNull();
    await act(async () => closePanel(context, 'files', 'file-19'));
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the section header its focus when a route change closed the panel', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const dispose = await open(options({ returnFocus: () => opener() }));
    await dispose();
    act(() => container.querySelector<HTMLElement>('#section-title')?.focus());
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(document.activeElement?.id).toBe('section-title');
    vi.useRealTimers();
  });

  it('takes focus back from the section header when its close button closed it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    let dispose: () => Promise<void> = async () => undefined;
    dispose = await open(options({ returnFocus: () => opener(), onClose: () => void dispose() }));
    await act(async () => container.querySelector<HTMLButtonElement>('.shell-panel__close')?.click());
    act(() => container.querySelector<HTMLElement>('#section-title')?.focus());
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(document.activeElement).toBe(opener());
    vi.useRealTimers();
  });

  it('shows an error in the panel when its content throws, keeping the page', async () => {
    const Broken = () => {
      throw new Error('pilet bug');
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(options({ content: <Broken /> }));
    quiet.mockRestore();
    expect(container.querySelector('.probe-content')?.textContent).toBe('The list');
    expect(panel()?.querySelector('[role="alert"]')?.textContent).toContain('This panel could not be shown');
  });

  it('returns focus to returnFocus when the opener has gone', async () => {
    const target = document.createElement('a');
    target.href = '#file-19';
    container.append(target);
    const dispose = await open(options({ returnFocus: () => target }));
    expect(document.activeElement).toBe(heading());
    await dispose();
    expect(document.activeElement).toBe(target);
  });

  it('leaves focus alone on close when the user has moved it elsewhere', async () => {
    const dispose = await open(options());
    opener()?.focus();
    await dispose();
    expect(document.activeElement).toBe(opener());
  });

  it('sits beside the content from 1200px and replaces it below', async () => {
    await open(options());
    expect(panel()?.className).toBe('shell-panel shell-panel--beside');
    expect(container.querySelector('.shell__body')?.className).toBe('shell__body');

    wide = false;
    await act(async () => {
      root.render(
        <StateContext value={context}>
          <MemoryRouter>
            <main tabIndex={-1}>
              <Workspace>
                <p className="probe-content">The list, at 992</p>
              </Workspace>
            </main>
          </MemoryRouter>
        </StateContext>,
      );
    });
    expect(panel()?.className).toBe('shell-panel');
    expect(container.querySelector('.shell__body')?.className).toBe('shell__body shell__body--hidden');
    // Hidden, not unmounted, so the page keeps its state under the panel
    expect(container.querySelector('.probe-content')?.textContent).toBe('The list, at 992');
  });

  it('shows one panel: another id replaces it without calling its onClose, and its disposer leaves the new one', async () => {
    const firstClose = vi.fn();
    const disposeFirst = await open(options({ onClose: firstClose }));
    await open(options({ id: 'file-20', title: 'Logo' }));
    expect(container.querySelectorAll('.shell-panel')).toHaveLength(1);
    expect(heading()?.textContent).toBe('Logo');
    expect(document.activeElement).toBe(heading());
    expect(firstClose).not.toHaveBeenCalled();
    await disposeFirst();
    expect(heading()?.textContent).toBe('Logo');
  });

  it('updates the same id in place, and a page re-opening from an effect does not close it', async () => {
    let disposeFirst: () => void = () => undefined;
    await act(async () => {
      disposeFirst = openPanel(context, 'files', options({ title: 'File 19' }));
    });
    opener()?.focus();
    let disposeSecond: () => void = () => undefined;
    await act(async () => {
      disposeFirst();
      disposeSecond = openPanel(context, 'files', options({ title: 'Card illustration' }));
      await Promise.resolve();
    });
    expect(heading()?.textContent).toBe('Card illustration');
    expect(document.activeElement).toBe(opener());
    await act(async () => {
      disposeSecond();
      await Promise.resolve();
    });
    expect(panel()).toBeNull();
  });

  it('is cleared when its pilet unloads', async () => {
    const extend = createSilverstripeApi()(context) as unknown as (api: PiletApi, meta: PiletMetadata) => Partial<PiletApi>;
    const piletApi = (name: string) => {
      const api = { emit: context.emit, on: context.on, off: context.off } as unknown as PiletApi;
      return Object.assign(api, extend(api, { name } as PiletMetadata));
    };
    await act(async () => {
      piletApi('files').openPanel(options());
    });
    await act(async () => context.emit('unload-pilet', { name: 'another-pilet' }));
    expect(panel()).not.toBeNull();
    await act(async () => context.emit('unload-pilet', { name: 'files' }));
    expect(panel()).toBeNull();
  });
});
