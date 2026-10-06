// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StateContext } from 'piral-core';
import type { GlobalState, GlobalStateContext } from 'piral-core';
import create from 'zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordsChangedEvent } from '../events';
import { builtInFields } from '../forms/fields';
import type { FieldSchema, FormSchemaResponse } from '../forms/types';
import { initialSectionHeader } from '../header/state';
import { initialUnsavedChanges } from '../unsaved';
import { RecordEditPage } from './RecordEditPage';
import { recordRoute } from './record';
import { resolveSectionRoute } from './resolve';
import type { ShellSection } from './resolve';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Piral's registry and instance need the app codegen a piral build produces, so fields resolve straight
// to the built-in components and a store with an event bus stands in for the global state context
const registry = vi.hoisted(() => ({ fields: {} as Record<string, React.ComponentType<any>> }));

vi.mock('../forms/useFieldComponent', async () => {
  const { resolveFieldComponent } = await import('../forms/resolve');
  return {
    useFieldComponent: (field: FieldSchema) => {
      const { name } = resolveFieldComponent(field, (candidate) => candidate in registry.fields);
      return registry.fields[name!];
    },
  };
});

function fakeContext(): GlobalStateContext {
  const store = create<GlobalState>(() => ({ sectionHeader: initialSectionHeader, unsavedChanges: initialUnsavedChanges }) as unknown as GlobalState);
  const listeners = new Map<string, Set<(arg: unknown) => void>>();
  const on = (type: string, listener: (arg: unknown) => void) => {
    listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    return context;
  };
  const context = {
    state: store,
    dispatch: (update: (state: GlobalState) => GlobalState) => store.setState(update(store.getState()), true),
    readState: <S,>(select: (state: GlobalState) => S) => select(store.getState()),
    on,
    off: (type: string, listener: (arg: unknown) => void) => {
      listeners.get(type)?.delete(listener);
      return context;
    },
    emit: (type: string, arg: unknown) => {
      listeners.get(type)?.forEach((listener) => listener(arg));
      return context;
    },
  } as unknown as GlobalStateContext;
  return context;
}

const model = 'App-Note';
const grid = `/notes/${model}/`;
const item = (id: string) => `admin/notes/${model}/EditForm/field/${model}/item/${id}`;
const section: ShellSection = { route: 'notes', title: 'Notes', url: 'admin/notes', modelTabs: [{ tab: model, title: 'Notes' }] };

function field(name: string, extra: Partial<FieldSchema>): FieldSchema {
  return {
    name,
    id: `Form_ItemEditForm_${name}`,
    type: 'text',
    schemaType: null,
    component: null,
    title: name,
    readOnly: false,
    disabled: false,
    data: [],
    ...extra,
  };
}

function schemaResponse(id: string, title: string | null): FormSchemaResponse {
  return {
    id: `${item(id)}/schema`,
    schema: {
      name: 'ItemEditForm',
      id: 'Form_ItemEditForm',
      action: `${item(id)}/ItemEditForm/`,
      method: 'POST',
      attributes: {},
      fields: [field('Title', { schemaType: 'Text' }), field('SecurityID', { schemaType: 'Hidden', type: 'hidden' })],
      actions: [
        field('action_doSave', { component: 'FormAction', type: 'submit', title: 'Save' }),
        ...(id === 'new' ? [] : [field('action_doDelete', { component: 'FormAction', type: 'submit', title: 'Delete' })]),
      ],
    },
    state: {
      id: 'Form_ItemEditForm',
      messages: [],
      fields: [
        { name: 'Title', id: 'Form_ItemEditForm_Title', value: title ?? '', message: null, data: [] },
        { name: 'SecurityID', id: 'Form_ItemEditForm_SecurityID', value: 'token', message: null, data: [] },
      ],
    },
    record: {
      id: id === 'new' ? null : Number(id),
      className: 'App\\Note',
      title,
      singularName: 'Note',
      link: id === 'new' ? null : `${item(id)}/edit/`,
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let container: HTMLDivElement;
let root: Root;
let context: GlobalStateContext;
let location = '';
let posts: Array<{ url: string; body: URLSearchParams }> = [];

const LocationProbe = () => {
  const current = useLocation();
  location = current.pathname;
  return null;
};

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

async function renderAt(path: string, notify = vi.fn()) {
  const route = recordRoute(resolveSectionRoute(path, [section])!)!;
  await act(async () => {
    root.render(
      <StateContext.Provider value={context}>
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <Routes>
            <Route path={path} element={<RecordEditPage route={route} notify={notify} />} />
            <Route path="*" element={<p>Elsewhere</p>} />
          </Routes>
        </MemoryRouter>
      </StateContext.Provider>,
    );
  });
  await flush();
  return notify;
}

const header = () => context.readState((state) => state.sectionHeader.current);

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === name);
  if (!found) {
    throw new Error(`No ${name} button`);
  }
  return found;
}

async function type(value: string) {
  const input = container.querySelector<HTMLInputElement>('#Form_ItemEditForm_Title')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(name: string) {
  await act(async () => button(name).click());
  await flush();
  await flush();
}

beforeEach(() => {
  window.ss = { config: { adminUrl: 'admin/', sections: [] } } as unknown as typeof window.ss;
  context = fakeContext();
  registry.fields = { ...builtInFields };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  posts = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function serve(post: (url: string, body: URLSearchParams) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init?: RequestInit) => {
      const url = input.toString().replace(/^https?:\/\/[^/]+\//, '');
      if (init?.method === 'POST') {
        const body = init.body as URLSearchParams;
        posts.push({ url, body });
        return post(url, body);
      }
      const id = /item\/(new|\d+)\/schema$/.exec(url)?.[1];
      return id ? json(schemaResponse(id, id === 'new' ? null : `Note ${id}`)) : json({}, 404);
    }),
  );
}

describe('RecordEditPage', () => {
  it('loads the record form and sets the header until it unmounts', async () => {
    serve(() => json({}, 500));
    await renderAt(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);

    expect(container.querySelector<HTMLInputElement>('#Form_ItemEditForm_Title')?.value).toBe('Note 4');
    expect(header()).toEqual({ title: 'Note 4', backTo: grid, backLabel: 'Back to notes' });

    act(() => root.unmount());
    root = createRoot(container);
    expect(header()).toBeNull();
  });

  it('shows the permission notice for a 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'error', errors: [{ value: 'No' }] }, 403)));
    await renderAt(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);
    expect(container.textContent).toContain('You do not have permission to open this record.');
  });

  it('goes to the saved record’s edit URL after creating it', async () => {
    serve(() => {
      const saved = schemaResponse('9', 'Fresh');
      return json({ id: saved.id, state: saved.state, record: saved.record, deleted: false, message: 'Saved Note "Fresh"' }, 201);
    });
    const changed = vi.fn();
    context.on(recordsChangedEvent, changed);
    const notify = await renderAt(`/notes/${model}/EditForm/field/${model}/item/new/edit/`);
    expect(header()?.title).toBe('New note');

    await type('Fresh');
    await press('Save');
    await flush();

    expect(posts[0].url).toBe(`${item('new')}/ItemEditForm/`);
    expect(posts[0].body.get('Title')).toBe('Fresh');
    expect(posts[0].body.has('action_doSave')).toBe(true);
    expect(notify).toHaveBeenCalledWith('Saved Note "Fresh"', 'success');
    expect(changed).toHaveBeenCalledWith({ recordClass: 'App\\Note', ids: [9] });
    expect(location).toBe(`/notes/${model}/EditForm/field/${model}/item/9/edit/`);
  });

  it('shows validation errors on their field and stays', async () => {
    serve(() =>
      json({
        id: 'x',
        state: schemaResponse('4', '').state,
        errors: [{ field: 'Title', value: 'Title is required', type: 'required' }],
      }),
    );
    const notify = await renderAt(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);

    await type('');
    await press('Save');

    expect(container.textContent).toContain('Title is required');
    expect(notify).not.toHaveBeenCalled();
    expect(location).toBe(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);
  });

  it('asks before deleting, then goes back to the grid', async () => {
    serve(() => json({ record: { id: 4, className: 'App\\Note', title: null, singularName: 'Note', link: null }, deleted: true, message: 'Deleted' }));
    const changed = vi.fn();
    context.on(recordsChangedEvent, changed);
    const notify = await renderAt(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);

    await press('Delete');
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Delete Note 4?');
    expect(posts).toHaveLength(0);

    await act(async () => Array.from(dialog.querySelectorAll('button')).find((element) => element.textContent === 'Delete')!.click());
    await flush();
    await flush();

    expect(posts).toHaveLength(1);
    expect(posts[0].body.has('action_doDelete')).toBe(true);
    expect(changed).toHaveBeenCalledWith({ recordClass: 'App\\Note', ids: [4] });
    expect(notify).toHaveBeenCalledWith('Delete succeeded: Note 4', 'success');
    expect(location).toBe(grid);
  });

  it('cancelling the delete dialog posts nothing', async () => {
    serve(() => json({}, 500));
    await renderAt(`/notes/${model}/EditForm/field/${model}/item/4/edit/`);

    await press('Delete');
    await act(async () => button('Cancel').click());
    await flush();

    expect(container.querySelector('dialog')?.open).toBe(false);
    expect(posts).toHaveLength(0);
  });
});
