// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBeforeSubmit } from './beforeSubmit';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema, submitFormSchema } from './schema';
import type { FieldComponentProps, FormSchemaFormHandle } from './types';

vi.mock('piral-core', () => ({ useGlobalStateContext: () => ({}) }));
vi.mock('../unsaved', () => ({ setUnsavedChanges: () => () => undefined, shellOwner: 'shell' }));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./schema')>()),
  fetchFormSchema: vi.fn(),
  submitFormSchema: vi.fn(),
}));
vi.mock('./useFieldComponent', () => ({
  useFieldComponent: () =>
    ({ field, value, onChange, formId, error }: FieldComponentProps<string>) =>
      field.type === 'submit' ? (
        <button type="submit" name={field.name} id={field.id}>
          Save
        </button>
      ) : (
        <>
          <input id={field.id} data-form-id={formId} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
          {error && <p>{error}</p>}
        </>
      ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const titleField = {
  name: 'Title',
  id: 'Form_Block_Title',
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: 'Title',
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
};

const saveAction = { ...titleField, name: 'action_save', id: 'Form_Block_action_save', type: 'submit', schemaType: null, component: 'FormAction', title: 'Save' };

const response = {
  id: 'schema/Block',
  schema: {
    id: 'schema/Block',
    name: 'Block',
    action: 'admin/block/save',
    method: 'POST',
    attributes: { id: 'Form_Block' },
    fields: [titleField],
    actions: [saveAction],
  },
  state: { id: 'Form_Block', fields: [{ name: 'Title', id: 'Form_Block_Title', value: 'Old', message: null, data: [] }], messages: [] },
};

let container: HTMLDivElement;
let root: Root;
const disposers: Array<() => void> = [];

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

function type(value: string) {
  const input = container.querySelector<HTMLInputElement>('#Form_Block_Title')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.mocked(fetchFormSchema).mockResolvedValue(response as never);
  vi.mocked(submitFormSchema).mockReset();
  vi.mocked(submitFormSchema).mockResolvedValue({ ...response, errors: [] } as never);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  disposers.splice(0).forEach((dispose) => dispose());
});

describe('FormSchemaForm headless mode', () => {
  it('renders no form element or action bar and passes the form id to fields', async () => {
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('.shell-form__actions')).toBeNull();
    expect(container.querySelector('#Form_Block_Title')?.getAttribute('data-form-id')).toBe('Form_Block');
  });

  it('reports dirty state and posts through the handle', async () => {
    const handle = React.createRef<FormSchemaFormHandle>();
    const onDirtyChange = vi.fn();
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} onDirtyChange={onDirtyChange} />);
    expect(handle.current?.isDirty()).toBe(false);
    type('New');
    await flush();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(handle.current?.isDirty()).toBe(true);
    let result: unknown;
    await act(async () => {
      result = await handle.current!.submit();
    });
    expect(result).toMatchObject({ ok: true });
    const [, body] = vi.mocked(submitFormSchema).mock.calls[0];
    expect(String(body)).toContain('Title=New');
    expect(String(body)).toContain('action_save=');
  });

  it('reports a failed submission without throwing', async () => {
    vi.mocked(submitFormSchema).mockResolvedValue({ ...response, errors: [{ type: 'error', value: 'Title is required', field: 'Title' }] } as never);
    const handle = React.createRef<FormSchemaFormHandle>();
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} />);
    type('');
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await handle.current!.submit('action_save');
    });
    expect(result?.ok).toBe(false);
    expect(container.textContent).toContain('Title is required');
  });

  it('keeps Enter in an input from submitting the outer form', async () => {
    const outerSubmit = vi.fn((event: Event) => event.preventDefault());
    await render(
      <form onSubmit={outerSubmit as never}>
        <FormSchemaForm schemaUrl="schema/Block" headless />
      </form>,
    );
    const input = container.querySelector<HTMLInputElement>('#Form_Block_Title')!;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      input.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(submitFormSchema).not.toHaveBeenCalled();
  });
});

describe('FormSchemaForm before-submit handlers', () => {
  it('runs the handlers before posting and cancels when one answers false', async () => {
    const order: Array<string> = [];
    let allow = false;
    disposers.push(
      registerBeforeSubmit('Form_Block', 'test', async () => {
        order.push('handler');
        return allow;
      }),
    );
    vi.mocked(submitFormSchema).mockImplementation(async () => {
      order.push('post');
      return { ...response, errors: [] } as never;
    });
    await render(<FormSchemaForm schemaUrl="schema/Block" />);
    type('New');
    await flush();
    const submitForm = () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(order).toEqual(['handler']);
    allow = true;
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(order).toEqual(['handler', 'handler', 'post']);
  });

  it('posts what a handler writes into a field', async () => {
    const handle = React.createRef<FormSchemaFormHandle>();
    disposers.push(
      registerBeforeSubmit('Form_Block', 'test', () => {
        type('Flushed');
      }),
    );
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} />);
    type('Typed');
    await act(async () => {
      await handle.current!.submit();
    });
    const [, body] = vi.mocked(submitFormSchema).mock.calls[0];
    expect(String(body)).toContain('Title=Flushed');
  });
});
