// @vitest-environment happy-dom
import type { PiletApi } from '@silverstripe/admin-shell';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockEditRoute, createBlockEditPage } from './BlockEditPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quoteClass = 'App\\Blocks\\QuoteBlock';
const pageClass = 'SilverStripe\\CMS\\Model\\SiteTree';
const record = { id: 65, className: quoteClass, title: '', singularName: 'Quote', link: '/admin/pages/edit/EditForm/7/field/ElementalArea/item/65/edit', parentTitle: 'Home' };

let container: HTMLDivElement;
let root: Root;
let formProps: Record<string, any>;
let api: PiletApi & { emitted: Array<unknown>; toasts: Array<string>; headers: Array<Record<string, any>> };
let dirty = false;
let shownPage: { currentRecord: { recordClass: string; id: number } | null; header: Record<string, unknown> | null };
const dirtyListeners = new Set<() => void>();

function setDirty(next: boolean) {
  dirty = next;
  dirtyListeners.forEach((listener) => listener());
}

function subscribeDirty(listener: () => void) {
  dirtyListeners.add(listener);
  return () => {
    dirtyListeners.delete(listener);
  };
}
let location = '';

const FakeFormSchemaForm = (props: Record<string, any>) => {
  formProps = props;
  return (
    <div>
      Block form
      <div className="actions-end">{props.previewControls}</div>
    </div>
  );
};

const Location = () => {
  location = useLocation().pathname;
  return null;
};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

async function render(path = '/pages/edit/EditForm/7/field/ElementalArea/item/65/edit/') {
  const Page = createBlockEditPage({
    api,
    types: [{ name: 'App_Blocks_QuoteBlock', class: quoteClass, title: 'Quote', icon: '', inlineEditable: false }],
    pageClass,
    routePrefix: '/pages',
    editSectionUrl: 'https://example.test/admin/pages/edit',
  }) as React.ComponentType;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/pages/*" element={<p>Pages section</p>} />
          <Route path={blockEditRoute('/pages')} element={<Page />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}

beforeEach(() => {
  dirty = false;
  shownPage = { currentRecord: null, header: null };
  api = {
    fetchJson: vi.fn(),
    emitted: [],
    recordsChangedEvent: 'silverstripe:records-changed',
    toasts: [],
    headers: [],
    getSilverstripeComponent: () => FakeFormSchemaForm,
    setSectionHeader: (header: Record<string, any>) => {
      api.headers.push(header);
      return () => undefined;
    },
    hasUnsavedChanges: () => dirty,
    useSharedState: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ ...shownPage, unsavedChanges: React.useSyncExternalStore(subscribeDirty, () => dirty) }),
    showNotification: (content: string) => {
      api.toasts.push(content);
      return () => undefined;
    },
    emit: (_name: string, event: unknown) => {
      api.emitted.push(event);
    },
  } as unknown as typeof api;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('BlockEditPage', () => {
  it('outranks the pages section for an item URL and loads the item schema', async () => {
    await render();
    expect(container.textContent).toContain('Block form');
    expect(formProps.schemaUrl).toBe('https://example.test/admin/pages/edit/EditForm/7/field/ElementalArea/item/65/schema');
    act(() => {
      formProps.onLoad({ id: 'x', record });
    });
    const header = api.headers[api.headers.length - 1];
    expect(header).toMatchObject({ title: 'Quote block', backTo: '/pages/edit/show/7', backLabel: 'Back to Home' });
    expect(header.crumbs[1]).toEqual({ label: 'Home', to: '/pages/edit/show/7' });
  });

  it('names the page from the header the page form showed, with no request of its own', async () => {
    shownPage = {
      currentRecord: { recordClass: pageClass, id: 7 },
      header: { title: 'About us', views: [{ key: 'edit', label: 'Content', to: '/pages/edit/show/7', current: true }] },
    };
    await render();
    expect(api.headers[0].crumbs[1]).toEqual({ label: 'About us', to: '/pages/edit/show/7' });
    expect(api.headers[0].backLabel).toBe('Back to About us');
    expect(api.fetchJson).not.toHaveBeenCalled();
    act(() => {
      formProps.onLoad({ id: 'x', record });
    });
    expect(api.headers[api.headers.length - 1].crumbs[1].label).toBe('About us');
  });

  it('names the page from the block schema on a direct load', async () => {
    shownPage = { currentRecord: { recordClass: pageClass, id: 8 }, header: { title: 'Other page', views: [] } };
    await render();
    expect(api.headers[0].crumbs[1].label).toBe('Page #7');
    act(() => {
      formProps.onLoad({ id: 'x', record });
    });
    expect(api.headers[api.headers.length - 1].crumbs[1]).toEqual({ label: 'Home', to: '/pages/edit/show/7' });
    expect(api.fetchJson).not.toHaveBeenCalled();
  });

  it('leaves out the legacy navigator and hands its preview links to the shell preview controls', async () => {
    await render();
    expect(formProps.omitFields).toEqual(['SilverStripeNavigator']);
    expect(api.headers[api.headers.length - 1].preview).toBeUndefined();
    const navigator =
      '<div class="cms-navigator"><select><option value="split">Split mode</option></select>' +
      '<a href="/?ElementalPreview=1&amp;stage=Stage#e65">Draft</a><a href="/?ElementalPreview=2&amp;stage=Live#e65">Published</a></div>';
    act(() => {
      formProps.onStateChange({ id: 'x', fields: [{ name: 'SilverStripeNavigator', value: navigator }] });
    });
    const draft = new URL(api.headers[api.headers.length - 1].preview);
    expect(draft.searchParams.get('stage')).toBe('Stage');
    expect(draft.searchParams.get('CMSPreview')).toBe('1');
    expect(draft.hash).toBe('#e65');
    expect(container.textContent).not.toContain('Split mode');

    const radios = [...container.querySelectorAll<HTMLInputElement>('.actions-end input[type="radio"]')];
    expect(radios).toHaveLength(2);
    act(() => radios[1].click());
    expect(new URL(api.headers[api.headers.length - 1].preview).searchParams.get('stage')).toBe('Live');
  });

  it('shows the block type as the header badge once the block loads', async () => {
    await render();
    expect(api.headers[api.headers.length - 1].badge).toBeUndefined();
    act(() => {
      formProps.onLoad({ id: 'x', record: { ...record, title: 'Opening quote' } });
    });
    expect(api.headers[api.headers.length - 1]).toMatchObject({ title: 'Opening quote', badge: 'Quote' });
  });

  it('reports a save for the block and its page', async () => {
    await render();
    act(() => {
      formProps.onSubmitted({ id: 'x', record: { ...record, title: 'Saved quote' }, message: 'Saved Quote "Saved quote"' }, { name: 'action_doSave', title: 'Save' });
    });
    expect(api.emitted).toEqual([
      { recordClass: quoteClass, ids: [65] },
      { recordClass: pageClass, ids: [7] },
    ]);
    expect(api.toasts).toEqual(['Saved Quote "Saved quote"']);
    expect(api.headers[api.headers.length - 1].title).toBe('Saved quote');
  });

  it('asks before archiving, Cancel first, and goes back to the page once the form is clean', async () => {
    await render();
    let answer: Promise<boolean> | boolean = false;
    act(() => {
      answer = formProps.confirmAction({ name: 'action_doArchive', title: 'Archive' });
    });
    const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter((candidate) => candidate.textContent);
    expect(buttons.map((candidate) => candidate.textContent)).toEqual(['Cancel', 'Archive']);
    act(() => buttons[1].click());
    await expect(answer).resolves.toBe(true);

    act(() => setDirty(true));
    act(() => {
      formProps.onSubmitted({ id: 'x', record, deleted: true }, { name: 'action_doArchive', title: 'Archive' });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(location).toBe('/pages/edit/EditForm/7/field/ElementalArea/item/65/edit/');
    act(() => setDirty(false));
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(location).toBe('/pages/edit/show/7');
    expect(api.toasts).toEqual(['Archive succeeded: Quote block']);
    expect(api.emitted).toHaveLength(2);
  });

  it('confirms nothing for other actions', async () => {
    await render();
    expect(formProps.confirmAction({ name: 'action_doSave', title: 'Save' })).toBe(true);
  });
});
