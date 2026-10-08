// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChildrenResponse, PageNode, TreeApi } from './api';
import type { RecordsChangedEvent } from './events';
import { createPagesSection, pageAncestors, pageSectionHeader, parsePageTail, TreeQueries } from './PagesSection';
import type { ChildPageQueryHook } from './PagesSection';
import { createPagesSessionHolder, createPagesSidebar } from './PagesSidebar';
import type { PagesSession, PagesSidebarSlotProps } from './PagesSidebar';
import { siteTreeClass, TreeStore } from './treeStore';

vi.mock('./PageTree', () => ({ PageTree: () => null }));
vi.mock('./AddPageDialog', () => ({ AddPageDialog: () => null }));

// The patterns package resolves its own React copy under vitest, so its hooks fail here
vi.mock('@silverstripe/admin-patterns', () => ({
  AddIcon: () => null,
  Button: ({ variant, icon, children, ...rest }: { variant?: string; icon?: unknown; children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', 'data-variant': variant, ...rest }, children),
  FieldHolder: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  fieldTitle: (field: { title?: string }) => field.title ?? '',
  Toggle: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('pageSectionHeader', () => {
  it('titles the index with the section and no back button or views', () => {
    expect(pageSectionHeader('/pages', null)).toEqual({ title: 'Pages' });
  });

  it('titles a page, goes back to the index and marks the open view current', () => {
    const header = pageSectionHeader('/pages', { id: 1, title: 'Home', view: 'edit' });
    expect([header.title, header.backTo, header.backLabel]).toEqual(['Home', '/pages/', 'Back to pages']);
    expect(header.views?.map((view) => [view.label, view.to, view.current])).toEqual([
      ['Content', '/pages/edit/show/1', true],
      ['Settings', '/pages/settings/show/1', false],
      ['History', '/pages/history/show/1', false],
    ]);
  });

  it('leaves back to the nearest ancestor when the page has one', () => {
    const header = pageSectionHeader('/pages', {
      id: 5, title: 'Team', view: 'edit', ancestors: [{ id: 2, title: 'About' }],
    });
    expect(header.crumbs).toEqual([{ label: 'About', to: '/pages/edit/show/2' }]);
    expect([header.backTo, header.backLabel]).toEqual([undefined, undefined]);
  });

  it('falls back to the page id until the tree has the page', () => {
    const header = pageSectionHeader('/pages', { id: 7, title: undefined, view: 'history' });
    expect(header.title).toBe('Page 7');
    expect(header.views?.find((view) => view.current)?.key).toBe('history');
  });

  it('lists only the views the site has', () => {
    const header = pageSectionHeader('/pages', { id: 1, title: 'Home', view: 'settings' }, ['edit', 'settings']);
    expect(header.views?.map((view) => view.label)).toEqual(['Content', 'Settings']);
  });
});

describe('parsePageTail', () => {
  const all = ['edit', 'settings', 'history'] as const;

  it('reads the view and page from a legacy tail, with or without the trailing slash', () => {
    expect(parsePageTail('edit/show/1', all)).toEqual({ view: 'edit', id: 1 });
    expect(parsePageTail('settings/show/22/', all)).toEqual({ view: 'settings', id: 22 });
    expect(parsePageTail('history/show/3', all)).toEqual({ view: 'history', id: 3 });
  });

  it('ignores other tails and views the site lacks', () => {
    expect(parsePageTail('', all)).toBeNull();
    expect(parsePageTail('edit/show/new', all)).toBeNull();
    expect(parsePageTail('edit/show/0', all)).toBeNull();
    expect(parsePageTail('edit/show/012', all)).toBeNull();
    expect(parsePageTail('edit/show/99999999999999999999', all)).toBeNull();
    expect(parsePageTail('history/show/3', ['edit', 'settings'])).toBeNull();
  });
});

describe('pageAncestors', () => {
  const nodes = new Map([
    [1, { id: 1, parentId: 0, title: 'About us' }],
    [2, { id: 2, parentId: 1, title: 'Team' }],
    [3, { id: 3, parentId: 2, title: 'Careers' }],
    [9, { id: 9, parentId: 8, title: 'Deep link' }],
  ]);
  const store = { node: (id: number) => nodes.get(id) as never };

  it('lists the loaded ancestors root first and draws them as crumbs to the content view', () => {
    const ancestors = pageAncestors(store, 3);
    expect(ancestors).toEqual([
      { id: 1, title: 'About us' },
      { id: 2, title: 'Team' },
    ]);
    expect(pageSectionHeader('/pages', { id: 3, title: 'Careers', view: 'settings', ancestors }).crumbs).toEqual([
      { label: 'About us', to: '/pages/edit/show/1' },
      { label: 'Team', to: '/pages/edit/show/2' },
    ]);
  });

  it('has none for a top-level page or one whose parent the tree has not loaded', () => {
    expect(pageAncestors(store, 1)).toEqual([]);
    expect(pageAncestors(store, 9)).toEqual([]);
    expect(pageSectionHeader('/pages', { id: 1, title: 'About us', view: 'edit', ancestors: [] })).not.toHaveProperty('crumbs');
  });
});

describe('createPagesSessionHolder', () => {
  const session = (): PagesSession => ({ api: {} as never, store: {} as never, createClient: {} as never, moveClient: {} as never });

  it('shares the open session with subscribers', () => {
    const holder = createPagesSessionHolder();
    let told = 0;
    holder.subscribe(() => told++);
    expect(holder.get()).toBeNull();
    const opened = session();
    holder.open(opened);
    expect(holder.get()?.store).toBe(opened.store);
    expect(told).toBe(1);
  });

  it('closes only the session it is given', () => {
    const holder = createPagesSessionHolder();
    const leaving = session();
    const arriving = session();
    holder.open(leaving);
    holder.open(arriving);
    holder.close(leaving);
    expect(holder.get()?.store).toBe(arriving.store);
    holder.close(arriving);
    expect(holder.get()).toBeNull();
  });
});

describe('PagesSidebar', () => {
  const store = { subscribe: () => () => undefined, getVersion: () => 0, sessionExpired: false };
  const api = { search: () => new Promise(() => undefined) };

  function renderSidebar(slot: PagesSidebarSlotProps) {
    const holder = createPagesSessionHolder();
    holder.open({ api, store, createClient: {} } as never);
    const Sidebar = createPagesSidebar({
      holder,
      recordClass: siteTreeClass,
      editPath: (id) => `/pages/edit/show/${id}`,
      loginUrl: '/admin/',
    });
    const piral = { showNotification: vi.fn(), useSharedState: () => null as never };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (next: PagesSidebarSlotProps) =>
      act(() =>
        root.render(
          React.createElement(MemoryRouter, null, React.createElement(Sidebar, { piral, ...next })),
        ),
      );
    render(slot);
    const field = () => container.querySelector<HTMLInputElement>('input[type="search"]');
    const done = () => {
      act(() => root.unmount());
      container.remove();
    };
    return { container, render, field, done };
  }

  it('draws "Add new" as the primary button in the toolbar and names the nav with the shell title', () => {
    const { container, done } = renderSidebar({ titleId: 'title', searchId: 'search', searchOpen: false, closeSearch: vi.fn() });
    const nav = container.querySelector('nav')!;
    expect([nav.getAttribute('aria-labelledby'), nav.hasAttribute('aria-label')]).toEqual(['title', false]);
    const add = container.querySelector('.pages-tree-toolbar button')!;
    expect(add.textContent).toBe('Add new');
    expect(add.getAttribute('data-variant')).toBe('primary');
    done();
  });

  it('shows the search while the shell has it open, focused, and Escape asks the shell to close it', () => {
    const closeSearch = vi.fn();
    const slot = { titleId: 'title', searchId: 'search', closeSearch };
    const { container, render, field, done } = renderSidebar({ ...slot, searchOpen: false });
    expect(field()).toBeNull();
    render({ ...slot, searchOpen: true });
    expect(container.querySelector('#search')).not.toBeNull();
    expect(document.activeElement).toBe(field());
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(field(), 'ab');
      field()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field()!.value).toBe('ab');
    act(() => void field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(closeSearch).toHaveBeenCalledTimes(1);
    render({ ...slot, searchOpen: false });
    render({ ...slot, searchOpen: true });
    expect(field()!.value).toBe('');
    done();
  });

  it('keeps the search shown and the nav named on its own without the shell slot props', () => {
    const { container, field, done } = renderSidebar({});
    expect(field()).not.toBeNull();
    expect(container.querySelector('nav')!.getAttribute('aria-label')).toBe('Page tree');
    done();
  });
});

describe('TreeQueries', () => {
  const rows: Record<number, Array<number>> = { 0: [1, 2], 2: [21] };

  function row(id: number, parentId: number): PageNode {
    const childCount = rows[id]?.length ?? 0;
    return {
      id, parentId, title: `Page ${id}`, menuTitle: '', urlSegment: '', className: 'Page', hasChildren: childCount > 0,
      childCount, statusFlags: [], canEdit: true, canDelete: true, sort: id,
    };
  }

  const api = {
    children: vi.fn(async (parentId: number, page: number, limit: number): Promise<ChildrenResponse> => {
      const ids = rows[parentId] ?? [];
      return { items: ids.map((id) => row(id, parentId)), pageInfo: { totalCount: ids.length, pageSize: limit, page, hasMore: false } };
    }),
    ancestors: vi.fn(),
    search: vi.fn(),
  } as unknown as TreeApi & { children: ReturnType<typeof vi.fn> };

  /**
   * Matches events the way the shell does: by the key's parent, or by a row the result shows, for the key's
   * class or one related to it in the config's `recordClasses`
   */
  function fakeServerCache() {
    const ancestry: Record<string, Array<string>> = { Page: [siteTreeClass] };
    const related = (first: unknown, second: string) =>
      first === second || ancestry[second]?.includes(first as string) || ancestry[first as string]?.includes(second);
    const listeners = new Set<(event: RecordsChangedEvent) => void>();
    const useServerQuery: ChildPageQueryHook = (key, fetcher, { records }) => {
      type Result = ReturnType<ChildPageQueryHook>;
      const [result, setResult] = React.useState<Result>({ status: 'pending', data: undefined, error: null, isFetching: true });
      const [generation, setGeneration] = React.useState(0);
      const shown = React.useRef<ReadonlyArray<number>>([]);
      shown.current = result.data ? records(result.data) : [];
      const id = key.join();
      React.useEffect(() => {
        const onEvent = ({ recordClass, ids }: RecordsChangedEvent) => {
          if (related(key[0], recordClass) && (ids.includes(key[1]) || shown.current.some((held) => ids.includes(held)))) {
            setGeneration((count) => count + 1);
          }
        };
        listeners.add(onEvent);
        return () => void listeners.delete(onEvent);
      }, [id]);
      React.useEffect(() => {
        let live = true;
        fetcher({ signal: new AbortController().signal }).then(
          (data) => live && setResult({ status: 'success', data, error: null, isFetching: false }),
          (error: Error) => live && setResult({ status: 'error', data: undefined, error, isFetching: false }),
        );
        return () => {
          live = false;
        };
      }, [id, generation]);
      return result;
    };
    return { useServerQuery, emit: (event: RecordsChangedEvent) => listeners.forEach((listener) => listener(event)) };
  }

  it('refetches a loaded parent when a records-changed event names it as a SiteTree record or under its own class', async () => {
    const cache = fakeServerCache();
    const store = new TreeStore(api);
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TreeQueries, { store, api, useServerQuery: cache.useServerQuery }));
    });
    let loaded: Promise<unknown> = Promise.resolve();
    act(() => {
      loaded = Promise.all([store.loadMore(0), store.loadMore(2)]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await loaded;
    expect(store.children(2).ids).toEqual([21]);
    api.children.mockClear();

    rows[2] = [21, 22];
    try {
      await act(async () => {
        cache.emit({ recordClass: 'App\\Unrelated', ids: [2] });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(api.children).not.toHaveBeenCalled();

      await act(async () => {
        cache.emit({ recordClass: siteTreeClass, ids: [2] });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(api.children.mock.calls.map(([parentId]) => parentId).sort()).toEqual([0, 2]);
      expect(store.children(2).ids).toEqual([21, 22]);
      expect(store.node(2)?.childCount).toBe(2);

      api.children.mockClear();
      rows[2] = [21, 22, 23];
      await act(async () => {
        cache.emit({ recordClass: 'Page', ids: [2] });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(api.children.mock.calls.map(([parentId]) => parentId).sort()).toEqual([0, 2]);
      expect(store.children(2).ids).toEqual([21, 22, 23]);
    } finally {
      rows[2] = [21];
    }

    act(() => root.unmount());
  });
});

describe('PagesSection submissions', () => {
  function renderSection() {
    let formProps: Record<string, any> = {};
    let location = '';
    const FakeFormSchemaForm = (props: Record<string, any>) => {
      formProps = props;
      return null;
    };
    const Location = () => {
      location = useLocation().pathname;
      return null;
    };
    const piral = {
      fetchJson: () => new Promise(() => undefined),
      getSilverstripeComponent: () => FakeFormSchemaForm,
      hasUnsavedChanges: vi.fn(() => false),
      invalidateRecords: vi.fn(),
      setCurrentRecord: () => undefined,
      setData: () => undefined,
      setSectionHeader: () => undefined,
      showNotification: vi.fn(),
      useServerQuery: () => ({ status: 'pending', data: undefined, error: null, isFetching: true }),
    };
    const { Page } = createPagesSection({
      routePrefix: '/pages',
      sectionCode: 'pages',
      sectionTitle: 'Pages',
      pageClass: siteTreeClass,
      treeUrl: 'https://example.test/admin/pages/tree/',
      createUrl: 'https://example.test/admin/pages/add/',
      moveUrl: 'https://example.test/admin/pages/move/',
      securityId: () => 'token',
      loginUrl: '/admin/',
      schemaUrls: { edit: (id) => `/admin/pages/edit/schema/EditForm/${id}` },
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/pages/edit/show/7'] },
          React.createElement(Location),
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/pages/*', element: React.createElement(Page, { piral } as never) }),
          ),
        ),
      ),
    );
    const done = () => {
      act(() => root.unmount());
      container.remove();
    };
    return { piral, form: () => formProps, location: () => location, done };
  }

  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  it("reports the action's own message, falling back to the action's title", () => {
    const { piral, form, done } = renderSection();

    act(() => form().onSubmitted({ id: 'x', message: 'Saved Page "Alpha"' }, { title: 'Save' }));
    act(() => form().onSubmitted({ id: 'x' }, { title: 'Publish' }));

    expect(piral.showNotification.mock.calls.map(([message]) => message)).toEqual(['Saved Page "Alpha"', 'Publish succeeded']);
    expect(piral.invalidateRecords).toHaveBeenCalledWith(siteTreeClass, [7]);
    done();
  });

  it('leaves for the section index once an archived page form is clean, refreshing its tree row', async () => {
    const { piral, form, location, done } = renderSection();
    piral.hasUnsavedChanges.mockReturnValueOnce(true);

    act(() => form().onSubmitted({ id: 'x', deleted: true, message: 'Archived Page "Alpha"' }, { title: 'Archive' }));
    expect(location()).toBe('/pages/edit/show/7');
    await settle();

    expect(piral.showNotification).toHaveBeenCalledWith('Archived Page "Alpha"', { type: 'success' });
    expect(piral.invalidateRecords).toHaveBeenCalledWith(siteTreeClass, [7]);
    expect(piral.hasUnsavedChanges).toHaveBeenCalledTimes(2);
    expect(location()).toBe('/pages/');
    done();
  });
});
