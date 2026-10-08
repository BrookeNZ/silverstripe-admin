// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { SchemaFormDialog } from './SchemaFormDialog';
import { fetchFormSchema, submitFormSchema } from './schema';
import { serverQueryClient } from '../state/serverCache';
import type { FieldComponentProps } from './types';

vi.mock('piral-core', () => ({
  useGlobalStateContext: () => ({}),
  useGlobalState: (select: (state: unknown) => unknown) => select({ sectionHeader: { current: null, entries: [] } }),
}));
vi.mock('../unsaved', () => ({ setUnsavedChanges: () => () => undefined, shellOwner: 'shell' }));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaModule>()),
  fetchFormSchema: vi.fn(),
  submitFormSchema: vi.fn(),
}));
vi.mock('./useFieldComponent', () => ({
  useFullWidthField: () => false,
  useFieldComponent: () =>
    ({ field, value, onChange, error }: FieldComponentProps<string>) => (
      <>
        <input id={field.id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
        {error && <p className="field-error">{error}</p>}
      </>
    ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const titleField = {
  name: 'Title',
  id: 'Form_LinkForm_Title',
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: 'Link text',
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
};

const action = (name: string, title: string, extraClass = '') => ({
  ...titleField,
  name,
  id: `Form_LinkForm_${name}`,
  type: 'submit',
  schemaType: null,
  component: 'FormAction',
  title,
  extraClass,
});

const response = {
  id: 'schema/LinkForm',
  schema: {
    id: 'schema/LinkForm',
    name: 'LinkForm',
    action: 'admin/linkfield/linkForm/0',
    method: 'POST',
    attributes: { id: 'Form_LinkForm' },
    fields: [titleField],
    actions: [action('action_save', 'Create link'), action('action_test', 'Test link', 'btn-outline-secondary')],
  },
  state: { id: 'Form_LinkForm', fields: [{ name: 'Title', id: 'Form_LinkForm_Title', value: '', message: null, data: [] }], messages: [] },
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve));
    }
  });
}

async function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(element));
  await flush();
}

const footerButtons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.admin-dialog__actions button'));

beforeEach(() => {
  vi.mocked(fetchFormSchema).mockReset();
  vi.mocked(fetchFormSchema).mockResolvedValue(response as never);
  vi.mocked(submitFormSchema).mockReset();
  vi.mocked(submitFormSchema).mockResolvedValue({ ...response, errors: [] } as never);
});

afterEach(() => {
  // Each test loads its own schema under the same key
  serverQueryClient.clear();
  act(() => root.unmount());
  container.remove();
});

describe('SchemaFormDialog', () => {
  // happy-dom ignores the form attribute when finding a form owner, which browsers honour (checked in Chrome)
  it('leaves intro controls with no form owner, so Enter in one cannot submit an enclosing form', async () => {
    await render(
      <form id="outer">
        <SchemaFormDialog open header="Add link" intro={<input type="radio" name="kind" aria-label="Page" />} schemaUrl="schema/LinkForm" onClose={() => undefined} />
      </form>,
    );
    expect(container.querySelector('input[name="kind"]')!.getAttribute('form')).toBe('');
  });

  it('renders the form headless in the body and Cancel then the schema actions in the footer', async () => {
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} />);
    expect(container.querySelector('.admin-dialog__body form')).toBeNull();
    expect(container.querySelector('.admin-dialog__body #Form_LinkForm_Title')).not.toBeNull();
    expect(footerButtons().map((button) => button.textContent)).toEqual(['Cancel', 'Create link', 'Test link']);
    expect(footerButtons().map((button) => button.classList.contains('admin-button--primary'))).toEqual([false, true, false]);
  });

  it('posts the clicked action, marks it loading meanwhile and hands the response to the host', async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    vi.mocked(submitFormSchema).mockImplementation(() => new Promise((resolve) => (resolvePost = resolve)) as never);
    const onSubmitted = vi.fn();
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} onSubmitted={onSubmitted} />);
    await act(async () => footerButtons()[2].click());
    await flush();
    const [, body] = vi.mocked(submitFormSchema).mock.calls[0];
    expect(String(body)).toContain('action_test=');
    expect(String(body)).not.toContain('action_save=');
    expect(footerButtons()[2].getAttribute('aria-busy')).toBe('true');
    expect(footerButtons()[1].disabled).toBe(true);
    await act(async () => resolvePost({ ...response, errors: [] }));
    await flush();
    expect(onSubmitted).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'action_test' }));
    expect(footerButtons()[2].getAttribute('aria-busy')).toBeNull();
    expect(footerButtons()[1].disabled).toBe(false);
  });

  it('marks the first action busy while Enter in a field posts it', async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    vi.mocked(submitFormSchema).mockImplementation(() => new Promise((resolve) => (resolvePost = resolve)) as never);
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} />);
    const input = container.querySelector<HTMLInputElement>('#Form_LinkForm_Title')!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, 'Home');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    // The mocked field component is a new type on every render, so the input has been replaced
    const typedInput = container.querySelector<HTMLInputElement>('#Form_LinkForm_Title')!;
    await act(async () => {
      typedInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(submitFormSchema).toHaveBeenCalledTimes(1);
    expect(footerButtons()[1].getAttribute('aria-busy')).toBe('true');
    expect(footerButtons()[2].disabled).toBe(true);
    await act(async () => resolvePost({ ...response, errors: [] }));
    await flush();
    expect(footerButtons()[1].getAttribute('aria-busy')).toBeNull();
  });

  it('shows server errors in the body and does not hand over a failed post', async () => {
    vi.mocked(submitFormSchema).mockResolvedValue({
      ...response,
      errors: [{ type: 'error', value: 'Link text is required', field: 'Title' }],
    } as never);
    const onSubmitted = vi.fn();
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} onSubmitted={onSubmitted} />);
    await act(async () => footerButtons()[1].click());
    await flush();
    expect(container.querySelector('.admin-dialog__body .field-error')?.textContent).toBe('Link text is required');
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('closes through the host on Cancel and on Escape', async () => {
    const onClose = vi.fn();
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={onClose} />);
    await act(async () => footerButtons()[0].click());
    act(() => {
      container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(submitFormSchema).not.toHaveBeenCalled();
  });

  it('focuses the heading while the form loads, then its first field', async () => {
    let resolveLoad: (value: unknown) => void = () => undefined;
    vi.mocked(fetchFormSchema).mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)) as never);
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} />);
    expect(document.activeElement).toBe(container.querySelector('.admin-dialog__title'));
    await act(async () => resolveLoad(response));
    await flush();
    expect(document.activeElement?.id).toBe('Form_LinkForm_Title');
  });

  it('leaves focus where the user moved it while the form loaded', async () => {
    let resolveLoad: (value: unknown) => void = () => undefined;
    vi.mocked(fetchFormSchema).mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)) as never);
    await render(<SchemaFormDialog open header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} />);
    act(() => footerButtons()[0].focus());
    await act(async () => resolveLoad(response));
    await flush();
    expect(document.activeElement).toBe(footerButtons()[0]);
  });

  it('loads no form while closed', async () => {
    await render(<SchemaFormDialog open={false} header="Add link" schemaUrl="schema/LinkForm" onClose={() => undefined} />);
    expect(fetchFormSchema).not.toHaveBeenCalled();
    expect(footerButtons().map((button) => button.textContent)).toEqual(['Cancel']);
  });
});
