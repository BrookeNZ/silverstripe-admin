// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '@silverstripe/admin-patterns';
import type { PiletApi } from '@silverstripe/admin-shell';
import type { SchemaFormDialogProps } from '@silverstripe/admin-shell';
import { connectConfig } from '../legacy/Config';
import { connectServerCache } from '../legacy/Backend';
import type { ServerCache } from '../legacy/Backend';
import { createLinkField } from './LinkField';
import type { LinkFieldValue } from './LinkField';
import { deleteLink, fetchLinkData, linkSchemaUrl, savedLinkId, sortLinks } from './linkApi';

vi.mock('./linkApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./linkApi')>()),
  fetchLinkData: vi.fn(),
  deleteLink: vi.fn(),
  sortLinks: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The shell's cache in miniature: a read refetches on any announced change, as a Link key would */
function fakeServerCache(): ServerCache {
  const readers = new Set<() => void>();
  const announce = () => readers.forEach((refetch) => refetch());
  const request = (() => Promise.reject(new Error('No server in tests'))) as never;
  return {
    useServerQuery(key, fetcher, options = {}) {
      const [revision, setRevision] = React.useState(0);
      const [result, setResult] = React.useState<{ data?: unknown; error: Error | null; fetching: boolean }>({ error: null, fetching: false });
      React.useEffect(() => {
        const refetch = () => setRevision((count) => count + 1);
        readers.add(refetch);
        return () => {
          readers.delete(refetch);
        };
      }, []);
      const keyText = JSON.stringify(key);
      React.useEffect(() => {
        if (options.enabled === false) {
          return undefined;
        }
        let current = true;
        setResult((previous) => ({ ...previous, fetching: true }));
        fetcher({ signal: new AbortController().signal, request }).then(
          (data) => current && setResult({ data, error: null, fetching: false }),
          (error) => current && setResult((previous) => ({ ...previous, error, fetching: false })),
        );
        return () => {
          current = false;
        };
      }, [keyText, revision, options.enabled]);
      const status = result.error ? 'error' : result.data === undefined ? 'pending' : 'success';
      return { status, data: result.data, error: result.error, isFetching: result.fetching, refetch: async () => setRevision((count) => count + 1) } as never;
    },
    useServerMutation(mutation, options = {}) {
      return {
        mutate: async (variables: unknown) => {
          const result = await mutation(variables as never, request);
          if (options.changes?.(variables as never, result)) {
            announce();
          }
          return result;
        },
        status: 'idle',
        error: null,
        reset: () => undefined,
      } as never;
    },
    invalidateRecords: announce,
    fetchJson: request,
  };
}

const fetchData = vi.mocked(fetchLinkData);
const removeLink = vi.mocked(deleteLink);
const reorder = vi.mocked(sortLinks);
let container: HTMLDivElement;

const formProps: Array<{ schemaUrl: string }> = [];
const FakeDialog = ({ open, header, schemaUrl, onClose, onSubmitted }: SchemaFormDialogProps) => {
  if (open) {
    formProps.push({ schemaUrl });
  }
  return (
    <Dialog open={open} onClose={onClose} header={header}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitted?.({ id: `admin/linkfield/linkForm/42?typeKey=external` }, {} as never);
        }}
      >
        <button type="submit">Create link</button>
      </form>
    </Dialog>
  );
};
const LinkField = createLinkField(FakeDialog);

const types = {
  sitetree: { key: 'sitetree', title: 'Page on this site', allowed: true, priority: 0 },
  external: { key: 'external', title: 'Link to external URL', allowed: true, priority: 20 },
  phone: { key: 'phone', title: 'Phone number', allowed: false, priority: 40 },
};

function field(extra: Record<string, unknown> = {}) {
  return {
    id: 'Form_EditForm_ButtonTwo',
    name: 'ButtonTwo',
    key: 'ButtonTwo',
    title: 'Button two',
    schemaType: 'Custom',
    component: 'LinkField',
    value: 0,
    message: null,
    source: [],
    children: [],
    data: {},
    types,
    ownerID: 15,
    ownerClass: 'Page',
    ownerRelation: 'ButtonTwo',
    excludeLinkTextField: false,
    ...extra,
  } as any;
}

const link = (title: string, sort = 1, versionState = 'unsaved') => ({
  title,
  description: 'https://example.com',
  canDelete: true,
  versionState,
  typeKey: 'external',
  sort,
});

const Harness = ({ initial, schema, onValue }: { initial: LinkFieldValue; schema: any; onValue?(value: LinkFieldValue): void }) => {
  const [value, setValue] = React.useState<LinkFieldValue>(initial);
  return (
    <form onSubmit={() => onValue?.('page form submitted' as any)}>
      <LinkField
        field={schema}
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
        onBlur={() => undefined}
        submitting={false}
        renderFields={() => null}
        autofill={() => undefined}
      />
    </form>
  );
};

async function render(element: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => createRoot(container).render(element));
  return container;
}

const click = (element: Element | null) => act(async () => (element as HTMLElement).click());

beforeEach(() => {
  connectConfig({ getConfig: () => ({ SecurityID: 'token', sections: [] }) } as unknown as PiletApi);
  connectServerCache(fakeServerCache());
  fetchData.mockReset();
  removeLink.mockReset();
  reorder.mockReset();
  formProps.length = 0;
});

afterEach(() => {
  container.remove();
  document.body.innerHTML = '';
});

describe('LinkField', () => {
  it('lists the linked record with its type and opens it for editing in a dialog', async () => {
    fetchData.mockResolvedValue({ 7: link('Read more') });
    const root = await render(<Harness initial={7} schema={field()} />);
    expect(fetchData).toHaveBeenCalledWith([7], expect.anything());
    const edit = root.querySelector('#Form_EditForm_ButtonTwo_link_7')!;
    expect(edit.textContent).toBe('Read moreLink to external URL: https://example.com');
    expect(root.querySelector('.link-field__delete svg')?.getAttribute('aria-label')).toBe('Delete Read more');
    // has_one with a link: no room for another
    expect(root.querySelector('#Form_EditForm_ButtonTwo_add')).toBeNull();

    await click(edit);
    const dialog = document.querySelector('dialog[open]')!;
    expect(dialog.querySelector('.admin-dialog__title')?.textContent).toBe('Edit link');
    expect(formProps[formProps.length - 1]?.schemaUrl).toBe('admin/linkfield/schema/linkForm/7?typeKey=external&ownerID=15&ownerClass=Page&ownerRelation=ButtonTwo');
  });

  it('adds a link of a chosen allowed type and posts the saved id without submitting the page form', async () => {
    fetchData.mockResolvedValue({ 42: link('New link') });
    const onValue = vi.fn();
    const root = await render(<Harness initial={0} schema={field()} onValue={onValue} />);
    const add = root.querySelector('#Form_EditForm_ButtonTwo_add')!;
    expect(add.getAttribute('aria-expanded')).toBe('false');

    await click(add);
    expect(add.getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(root.querySelectorAll('.link-field__type')).map((option) => option.textContent);
    expect(options).toEqual(['Page on this site', 'Link to external URL']);

    await click(root.querySelectorAll('.link-field__type')[1]);
    expect(document.querySelector('dialog[open] .admin-dialog__title')?.textContent).toBe('Link to external URL');
    expect(formProps[formProps.length - 1]?.schemaUrl).toContain('linkForm/0?typeKey=external&ownerID=15');

    await click(document.querySelector('dialog[open] button[type="submit"]'));
    expect(onValue).toHaveBeenCalledWith(42);
    expect(onValue).not.toHaveBeenCalledWith('page form submitted');
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(root.querySelector('#Form_EditForm_ButtonTwo_link_42')?.textContent).toContain('New link');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Saved link');
    expect(document.activeElement?.id).toBe('Form_EditForm_ButtonTwo_link_42');
  });

  it('deletes a link after the confirm dialog and clears the value', async () => {
    fetchData.mockResolvedValue({ 7: link('Read more') });
    removeLink.mockResolvedValue();
    const onValue = vi.fn();
    const root = await render(<Harness initial={7} schema={field()} onValue={onValue} />);
    await click(root.querySelector('.link-field__delete'));
    const confirm = document.querySelector('dialog[open]')!;
    expect(confirm.querySelector('.admin-dialog__title')?.textContent).toBe('Delete link?');
    expect(removeLink).not.toHaveBeenCalled();

    await click(Array.from(confirm.querySelectorAll('button')).find((button) => button.textContent === 'Delete')!);
    expect(removeLink).toHaveBeenCalledWith(7, expect.objectContaining({ ownerID: 15, ownerClass: 'Page', ownerRelation: 'ButtonTwo' }));
    expect(onValue).toHaveBeenLastCalledWith(0);
    expect(root.querySelector('.link-field__link')).toBeNull();
    expect(document.activeElement?.id).toBe('Form_EditForm_ButtonTwo_add');
  });

  it('asks to archive a versioned link', async () => {
    fetchData.mockResolvedValue({ 7: link('Read more', 1, 'published') });
    const root = await render(<Harness initial={7} schema={field()} />);
    await click(root.querySelector('.link-field__delete'));
    expect(document.querySelector('dialog[open] .admin-dialog__title')?.textContent).toBe('Archive link?');
    expect(root.querySelector('.link-field__delete svg')?.getAttribute('aria-label')).toBe('Archive Read more');
  });

  it('shows a load failure as the field message', async () => {
    fetchData.mockRejectedValue(new Error('The links could not be loaded (500)'));
    const root = await render(<Harness initial={7} schema={field()} />);
    expect(document.getElementById('Form_EditForm_ButtonTwo_message')?.textContent).toBe('The links could not be loaded (500)');
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-describedby')).toBe('Form_EditForm_ButtonTwo_message');
  });

  it('reorders a multi-link field through the sort endpoint', async () => {
    fetchData.mockResolvedValue({ 1: link('First', 1), 2: link('Second', 2) });
    reorder.mockResolvedValue();
    const onValue = vi.fn();
    const root = await render(<Harness initial={[1, 2]} schema={field({ isMulti: true, maximumLinks: null })} onValue={onValue} />);
    expect(root.querySelector('#Form_EditForm_ButtonTwo_add')).not.toBeNull();
    const moveDown = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Move down')!;
    await click(moveDown);
    expect(reorder).toHaveBeenCalledWith([2, 1]);
    expect(onValue).toHaveBeenLastCalledWith([2, 1]);
  });

  it('offers no add or delete on a read-only field', async () => {
    fetchData.mockResolvedValue({ 7: link('Read more') });
    const root = await render(<Harness initial={7} schema={field({ readOnly: true, isMulti: true })} />);
    expect(root.querySelector('.link-field__delete')).toBeNull();
    expect(root.querySelector('#Form_EditForm_ButtonTwo_add')).toBeNull();
  });
});

describe('linkApi', () => {
  it('builds the link form schema URL and reads the saved id the way the legacy modal did', () => {
    expect(linkSchemaUrl(0, 'sitetree', { ownerID: 3, ownerClass: 'App\\Page', ownerRelation: 'CTA', excludeLinkTextField: true })).toBe(
      'admin/linkfield/schema/linkForm/0?typeKey=sitetree&ownerID=3&ownerClass=App%5CPage&ownerRelation=CTA&excludeLinkTextField=1',
    );
    expect(savedLinkId('admin/linkfield/linkForm/79?typeKey=external')).toBe(79);
    expect(savedLinkId('admin/linkfield/schema/linkfield/0')).toBeNull();
  });
});
