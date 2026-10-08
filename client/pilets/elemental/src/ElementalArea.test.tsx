// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ElementalApi } from './api';
import type { ElementType } from './blocks';
import { createElementalAreaField, precedingHeading } from './ElementalArea';
import type { BeforeFormSubmitHandler, BlockActionsHookContext, ElementalPiletApi, FormSchemaFormHandle, FormSchemaSubmitResult } from './shell';
import type { BlockAction } from './BlockRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const types: Array<ElementType> = [
  { name: 'App_Blocks_QuoteBlock', class: 'App\\Blocks\\QuoteBlock', title: 'Quote', icon: 'font-icon-block-quote', inlineEditable: true },
  { name: 'App_Blocks_CardBlock', class: 'App\\Blocks\\CardBlock', title: 'Cards', icon: 'font-icon-block-card', inlineEditable: false },
];

function block(id: number, title: string, typeName: string, flags: Partial<Block> = {}): Block {
  return {
    id,
    title,
    blockSchema: {
      typeName,
      actions: { edit: `https://example.test/admin/pages/edit/EditForm/7/field/ElementalArea/item/${id}/edit/` },
      content: `${title} summary`,
    },
    obsoleteClassName: null,
    version: 1,
    isPublished: true,
    isLiveVersion: true,
    canDelete: true,
    canPublish: true,
    canUnpublish: true,
    canCreate: true,
    ...flags,
  };
}

interface FakeForm {
  props: Record<string, any>;
  dirty: boolean;
  submit: ReturnType<typeof vi.fn<(action?: string) => Promise<FormSchemaSubmitResult>>>;
}

let container: HTMLDivElement;
let root: Root;
let stored: Array<Block>;
let client: { [K in keyof ElementalApi]: ReturnType<typeof vi.fn> };
let api: ElementalPiletApi & { emitted: Array<unknown>; hooks: Map<string, BeforeFormSubmitHandler>; toasts: Array<[string, unknown]> };
let forms: Map<string, FakeForm>;
let order: Array<string>;

const FakeFormSchemaForm = (props: Record<string, any>) => {
  const form = forms.get(props.schemaUrl) ?? {
    props,
    dirty: false,
    submit: vi.fn(async (action?: string) => {
      order.push(`submit ${props.schemaUrl}`);
      form.dirty = false;
      form.props.onDirtyChange?.(false);
      form.props.onSubmitted?.({ id: props.schemaUrl }, { name: action });
      return { ok: true };
    }),
  };
  form.props = props;
  forms.set(props.schemaUrl, form);
  React.useEffect(() => {
    const handle: FormSchemaFormHandle = { submit: (action) => form.submit(action), isDirty: () => form.dirty };
    props.handleRef(handle);
    return () => props.handleRef(null);
  }, []);
  return <div data-schema-url={props.schemaUrl}>Block form</div>;
};

function makeApi() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const fake = {
    emitted: [] as Array<unknown>,
    recordsChangedEvent: 'silverstripe:records-changed',
    hooks: new Map<string, BeforeFormSubmitHandler>(),
    toasts: [] as Array<[string, unknown]>,
    getSilverstripeComponent: () => FakeFormSchemaForm,
    showNotification: (content: string, options: unknown) => {
      fake.toasts.push([content, options]);
      return () => undefined;
    },
    emit: (name: string, event: unknown) => {
      fake.emitted.push(event);
      listeners.get(name)?.forEach((listener) => listener(event));
    },
    on: (name: string, listener: (event: any) => void) => {
      listeners.set(name, new Set([...(listeners.get(name) ?? []), listener]));
    },
    off: (name: string, listener: (event: any) => void) => {
      listeners.get(name)?.delete(listener);
    },
    registerHook: (name: string, handler: BeforeFormSubmitHandler) => {
      fake.hooks.set(name, handler);
      return () => fake.hooks.delete(name);
    },
  };
  return fake as unknown as typeof api;
}

const field = {
  id: 'Form_EditForm_ElementalArea',
  name: 'ElementalArea',
  holderId: 'Form_EditForm_ElementalArea_Holder',
  'elemental-area-id': 21,
  'page-id': 7,
  'allowed-elements': ['App\\Blocks\\QuoteBlock', 'App\\Blocks\\CardBlock'],
};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

async function render(areaHeading?: string, fieldProps: object = field) {
  const Area = createElementalAreaField({
    api,
    client: client as unknown as ElementalApi,
    types,
    schemaUrl: (id) => `/schema/elementForm/${id}`,
    routerPath: (url) => new URL(url).pathname.replace(/^\/admin/, ''),
    pageClass: 'SilverStripe\\CMS\\Model\\SiteTree',
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const draw = (props: object) =>
    act(() =>
      root.render(
        <MemoryRouter>
          {areaHeading && <h2>{areaHeading}</h2>}
          <Area field={props as never} formId="Form_EditForm" value={{}} onChange={vi.fn()} onBlur={vi.fn()} submitting={false} renderFields={() => null} autofill={vi.fn()} />
        </MemoryRouter>,
      ),
    );
  draw(fieldProps);
  await flush();
  return async (props: object) => {
    draw(props);
    await flush();
  };
}

const button = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name,
  )!;

const lastToast = () => api.toasts[api.toasts.length - 1]?.[0];

const click = async (element: HTMLElement) => {
  act(() => element.click());
  await flush();
};

beforeEach(() => {
  stored = [block(1, 'Opening quote', 'App_Blocks_QuoteBlock', { isPublished: false, isLiveVersion: false }), block(2, 'Cards', 'App_Blocks_CardBlock', { isLiveVersion: false }), block(3, 'Closing quote', 'App_Blocks_QuoteBlock')];
  forms = new Map();
  order = [];
  api = makeApi();
  client = {
    readElements: vi.fn(async () => stored.map((item) => ({ ...item }))),
    create: vi.fn(async () => {
      stored = [...stored, block(9, 'New quote', 'App_Blocks_QuoteBlock', { isPublished: false })];
    }),
    publish: vi.fn(async () => undefined),
    unpublish: vi.fn(async () => undefined),
    archive: vi.fn(async (id: number) => {
      stored = stored.filter((item) => item.id !== id);
    }),
    duplicate: vi.fn(async () => undefined),
    sort: vi.fn(async (id: number, after: number) => {
      const moved = stored.find((item) => item.id === id)!;
      const others = stored.filter((item) => item !== moved);
      others.splice(after === 0 ? 0 : others.findIndex((item) => item.id === after) + 1, 0, moved);
      stored = others;
    }),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ElementalArea', () => {
  it('lists the blocks with type, summary and status, and posts no value', async () => {
    await render();
    const rows = [...container.querySelectorAll('.elemental-block')];
    expect(rows.map((row) => row.querySelector('.elemental-block__title')?.textContent)).toEqual(['Opening quoteDraft', 'CardsModified', 'Closing quote']);
    expect(rows[1].querySelector('.elemental-block__meta')?.textContent).toBe('Cards');
    expect(rows[2].querySelector('.elemental-block__summary')?.textContent).toBe('Closing quote summary');
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(client.readElements).toHaveBeenCalledWith(21, expect.anything());
  });

  it('shows the empty state', async () => {
    stored = [];
    await render();
    expect(container.textContent).toContain('Add blocks to place your content');
  });

  it('links a block that is not inline editable to its edit page in the router', async () => {
    await render();
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Edit Cards"]');
    expect(link?.getAttribute('href')).toBe('/pages/edit/EditForm/7/field/ElementalArea/item/2/edit/');
  });

  it('adds a block of the chosen type and re-reads the list', async () => {
    await render();
    await click(button('Add a block'));
    const input = document.querySelector<HTMLInputElement>('dialog [role="combobox"]')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    const quote = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'Quote')!;
    await click(quote);
    await click([...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((candidate) => candidate.textContent === 'Add block')!);
    expect(client.create).toHaveBeenCalledWith('App\\Blocks\\QuoteBlock', 21);
    expect(client.readElements).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('New quote');
    expect(lastToast()).toBe('Added a Quote block');
    // The new inline block opens for editing
    expect(forms.has('/schema/elementForm/9')).toBe(true);
  });

  it('inserts a block after the row whose add control was chosen', async () => {
    client.create.mockImplementationOnce(async (_class: string, _area: number, after?: number) => {
      const at = stored.findIndex((item) => item.id === after) + 1;
      stored = [...stored.slice(0, at), block(9, 'New quote', 'App_Blocks_QuoteBlock', { isPublished: false }), ...stored.slice(at)];
    });
    await render();
    expect(button('Add a block after Closing quote')).toBeUndefined();
    await click(button('Add a block after Opening quote'));
    expect(document.querySelector('dialog[open] .admin-dialog__title')?.textContent).toBe('Add a block after Opening quote');
    const input = document.querySelector<HTMLInputElement>('dialog [role="combobox"]')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'Quote')!);
    await click([...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((candidate) => candidate.textContent === 'Add block')!);
    expect(client.create).toHaveBeenCalledWith('App\\Blocks\\QuoteBlock', 21, 1);
    expect([...container.querySelectorAll('.elemental-block__title')].map((title) => title.firstChild?.textContent)).toEqual(['Opening quote', 'New quote', 'Cards', 'Closing quote']);
  });

  it('creates one block when Add block is pressed twice in one tick', async () => {
    await render();
    await click(button('Add a block'));
    const input = document.querySelector<HTMLInputElement>('dialog [role="combobox"]')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'Quote')!);
    const add = [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((candidate) => candidate.textContent === 'Add block')!;
    act(() => {
      add.click();
      add.click();
    });
    await flush();
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('shows a failed create inside the open dialog rather than as a toast, Cancel before Add block', async () => {
    client.create.mockRejectedValueOnce(new Error('Server error'));
    await render();
    await click(button('Add a block'));
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect([...dialog.querySelectorAll('.admin-dialog__actions button')].map((candidate) => candidate.textContent)).toEqual(['Cancel', 'Add block']);
    const input = dialog.querySelector<HTMLInputElement>('[role="combobox"]')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'Quote')!);
    await click([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Add block')!);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('The block could not be added: Server error');
    expect(api.toasts).toEqual([]);

    await click([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Cancel')!);
    await click(button('Add a block'));
    expect(document.querySelector('dialog[open] [role="alert"]')).toBeNull();
  });

  it('names the heading, list and add button after a heading placed before the area', async () => {
    await render('Full width block area (bottom)');
    expect(container.querySelector('.elemental-area__title')?.textContent).toBe('Blocks in Full width block area (bottom)');
    expect(container.querySelector('ol')?.getAttribute('aria-label')).toBe('Blocks in Full width block area (bottom)');
    expect(container.querySelector(`#${field.id}_add`)?.getAttribute('aria-label')).toBe('Add a block to Full width block area (bottom)');
    await click(button('Add a block to Full width block area (bottom)'));
    expect(document.querySelector('dialog[open] .admin-dialog__title')?.textContent).toBe('Add a block to Full width block area (bottom)');
  });

  it('finds the heading through the wrapper element Piral puts round each field', () => {
    const form = document.createElement('div');
    form.className = 'shell-form';
    form.innerHTML =
      '<piral-component><div id="title"><input></div></piral-component><piral-component><h2>Restricted width block area (top)</h2></piral-component><piral-component><div id="area"></div></piral-component><piral-component><div id="other"></div></piral-component>';
    expect(precedingHeading(form.querySelector<HTMLElement>('#area'))).toBe('Restricted width block area (top)');
    expect(precedingHeading(form.querySelector<HTMLElement>('#other'))).toBeNull();
    expect(precedingHeading(form.querySelector<HTMLElement>('#title'))).toBeNull();
  });

  it('keeps the plain names with no heading before the area', async () => {
    await render();
    expect(container.querySelector('.elemental-area__title')?.textContent).toBe('Blocks');
    expect(button('Add a block')).toBeDefined();
  });

  it('names an untitled block by its type', async () => {
    stored = [block(4, '', 'App_Blocks_QuoteBlock')];
    await render();
    expect(container.querySelector('.elemental-block__title')?.textContent).toBe('Quote block');
    expect(button('Reorder Quote block')).toBeDefined();
    expect(button('More options for Quote block')).toBeDefined();
  });

  it('publishes from the block menu, then notifies and emits records-changed', async () => {
    await render();
    await click(button('Publish'));
    expect(client.publish).toHaveBeenCalledWith(1);
    expect(lastToast()).toBe('Published "Opening quote"');
    expect(api.emitted).toEqual([
      { recordClass: 'App\\Blocks\\QuoteBlock', ids: [1] },
      { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] },
    ]);
  });

  it('asks before archiving and archives on confirm', async () => {
    await render();
    const archive = [...container.querySelectorAll<HTMLButtonElement>('#elemental-block-3-menu_Popover button')].find((candidate) => candidate.textContent === 'Archive')!;
    await click(archive);
    expect(client.archive).not.toHaveBeenCalled();
    expect(document.querySelector('dialog[open] .admin-dialog__title')?.textContent).toBe('Archive "Closing quote"?');
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('dialog[open] .admin-dialog__actions button')].find((candidate) => candidate.textContent === 'Archive')!;
    await click(confirm);
    expect(client.archive).toHaveBeenCalledWith(3);
    expect(container.textContent).not.toContain('Closing quote');
  });

  it('draws the menu from the updateBlockActions hook, which can add, reorder and drop actions', async () => {
    const copied: Array<[number, number]> = [];
    api.runUpdateHook = ((name: string, actions: ReadonlyArray<BlockAction>, context: BlockActionsHookContext) => {
      expect(name).toBe('updateBlockActions');
      expect(context.area).toEqual({ id: 21, pageId: 7 });
      const added = { id: 'copyLink', label: 'Copy link', onSelect: (target: Block) => void copied.push([target.id, context.block.id]) };
      return [added, ...actions.filter((action) => action.id !== 'duplicate')];
    }) as ElementalPiletApi['runUpdateHook'];
    await render();
    const labels = [...container.querySelectorAll<HTMLButtonElement>('#elemental-block-2-menu_Popover button')].map((candidate) => candidate.textContent);
    expect(labels).toEqual(['Copy link', 'Publish', 'Unpublish', 'Move up', 'Move down', 'Archive']);

    await click([...container.querySelectorAll<HTMLButtonElement>('#elemental-block-2-menu_Popover button')][0]);
    expect(copied).toEqual([[2, 2]]);
  });

  it('moves a block down and up through the sort endpoint', async () => {
    await render();
    const menuButton = (id: number, label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>(`#elemental-block-${id}-menu_Popover button`)].find((candidate) => candidate.textContent === label)!;
    await click(menuButton(1, 'Move down'));
    expect(client.sort).toHaveBeenLastCalledWith(1, 2);
    await click(menuButton(3, 'Move up'));
    expect(client.sort).toHaveBeenLastCalledWith(3, 2);
    expect([...container.querySelectorAll('.elemental-block')].map((row) => row.querySelector('.elemental-block__meta')?.textContent)).toEqual(['Cards', 'Quote', 'Quote']);
    expect(menuButton(2, 'Move up')).toBeUndefined();
    expect(menuButton(1, 'Move down')).toBeUndefined();
  });

  it('expands an inline block into its headless form and saves it', async () => {
    await render();
    await click(button('Edit Opening quote'));
    const form = forms.get('/schema/elementForm/1')!;
    expect(form.props.headless).toBe(true);
    expect(form.props.omitFields).toEqual(['History']);
    expect(button('Edit Opening quote').getAttribute('aria-expanded')).toBe('true');
    act(() => {
      form.dirty = true;
      form.props.onDirtyChange(true);
    });
    expect(container.textContent).toContain('Unsaved');
    await click(button('Save block'));
    expect(form.submit).toHaveBeenCalledWith('action_save');
    expect(lastToast()).toBe('Saved "Opening quote"');
    expect(container.textContent).not.toContain('Unsaved');
  });

  it('saves dirty blocks before the page form posts, and cancels the page save when one fails', async () => {
    await render();
    await click(button('Edit Opening quote'));
    await click(button('Edit Closing quote'));
    const first = forms.get('/schema/elementForm/1')!;
    const last = forms.get('/schema/elementForm/3')!;
    act(() => {
      first.dirty = true;
      first.props.onDirtyChange(true);
      last.dirty = true;
      last.props.onDirtyChange(true);
    });
    const handler = api.hooks.get('onBeforeFormSubmit')!;
    let allowed: boolean | void = undefined;
    await act(async () => {
      allowed = await handler({ formId: 'Form_Other', action: 'action_save', values: {} });
    });
    expect(allowed).toBe(true);
    expect(order).toEqual([]);
    await act(async () => {
      allowed = await handler({ formId: 'Form_EditForm', action: 'action_save', values: {} });
    });
    expect(allowed).toBe(true);
    expect(order).toEqual(['submit /schema/elementForm/1', 'submit /schema/elementForm/3']);

    last.dirty = true;
    last.submit.mockResolvedValueOnce({ ok: false });
    await act(async () => {
      allowed = await handler({ formId: 'Form_EditForm', action: 'action_publish', values: {} });
    });
    expect(allowed).toBe(false);
    expect(lastToast()).toBe('The page was not saved because a block could not be saved');
  });

  it('draws the list the schema sent without reading it, and re-reads on records-changed', async () => {
    await render(undefined, { ...field, data: { blocks: [block(4, 'From the schema', 'App_Blocks_QuoteBlock')] } });
    expect(client.readElements).not.toHaveBeenCalled();
    expect(container.textContent).toContain('From the schema');
    act(() => api.emit(api.recordsChangedEvent, { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] }));
    await flush();
    expect(client.readElements).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.elemental-block')).toHaveLength(3);
  });

  it('replaces the list when a refetched schema sends a new one', async () => {
    const rerender = await render(undefined, { ...field, data: { blocks: [block(4, 'First schema', 'App_Blocks_QuoteBlock')] } });
    await rerender({ ...field, data: { blocks: [block(5, 'Refetched schema', 'App_Blocks_QuoteBlock')] } });
    expect(client.readElements).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Refetched schema');
    expect(container.textContent).not.toContain('First schema');
  });

  it('re-reads the blocks when the page is saved', async () => {
    await render();
    act(() => api.emit(api.recordsChangedEvent, { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] }));
    await flush();
    expect(client.readElements).toHaveBeenCalledTimes(2);
  });

  it('keeps a block whose archive failed, with its unsaved changes', async () => {
    await render();
    await click(button('Edit Closing quote'));
    const form = forms.get('/schema/elementForm/3')!;
    act(() => {
      form.dirty = true;
      form.props.onDirtyChange(true);
    });
    client.archive.mockRejectedValueOnce(new Error('Archive refused'));
    const archive = [...container.querySelectorAll<HTMLButtonElement>('#elemental-block-3-menu_Popover button')].find((candidate) => candidate.textContent === 'Archive')!;
    await click(archive);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('dialog[open] .admin-dialog__actions button')].find((candidate) => candidate.textContent === 'Archive')!;
    await click(confirm);
    expect(lastToast()).toBe('Archive refused');
    expect(container.textContent).toContain('Closing quote');
    expect(container.textContent).toContain('Unsaved');
    await act(async () => {
      await api.hooks.get('onBeforeFormSubmit')!({ formId: 'Form_EditForm', action: 'action_save', values: {} });
    });
    expect(order).toEqual(['submit /schema/elementForm/3']);
  });

  it('keeps the loaded blocks on screen when a re-read fails', async () => {
    await render();
    client.readElements.mockRejectedValueOnce(new Error('Server error'));
    act(() => api.emit(api.recordsChangedEvent, { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] }));
    await flush();
    expect(container.querySelectorAll('.elemental-block')).toHaveLength(3);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Server error');
  });

  it('shows the latest re-read when overlapping reads answer out of order', async () => {
    await render();
    const answers: Array<(blocks: Array<Block>) => void> = [];
    client.readElements.mockImplementation(() => new Promise<Array<Block>>((resolve) => answers.push(resolve)));
    act(() => api.emit(api.recordsChangedEvent, { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] }));
    act(() => api.emit(api.recordsChangedEvent, { recordClass: 'SilverStripe\\CMS\\Model\\SiteTree', ids: [7] }));
    await act(async () => answers[1]([block(1, 'Newest', 'App_Blocks_QuoteBlock')]));
    await flush();
    await act(async () => answers[0]([block(1, 'Stale', 'App_Blocks_QuoteBlock'), block(2, 'Stale too', 'App_Blocks_CardBlock')]));
    await flush();
    expect(container.textContent).toContain('Newest');
    expect(container.textContent).not.toContain('Stale');
  });
});
