// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { registerHook, resetHooks } from '../hooks/registry';
import { registerShellValidation } from './validation';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema, FormSchemaRequestError, submitFormSchema } from './schema';
import { serverQueryClient } from '../state/serverCache';
import type { FieldComponentProps, FormSchemaFormHandle } from './types';
import { RecordLoadError, SectionLoadError } from '../sections/LoadError';
import type { ShellSection } from '../sections/resolve';

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
  // Each test loads its own schema under the same key
  serverQueryClient.clear();
  act(() => root.unmount());
  container.remove();
  disposers.splice(0).forEach((dispose) => dispose());
  resetHooks();
});

describe('FormSchemaForm headless mode', () => {
  it('renders no form element or action bar and passes the form id to fields', async () => {
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('.shell-form__actions')).toBeNull();
    expect(container.querySelector('#Form_Block_Title')?.getAttribute('data-form-id')).toBe('Form_Block');
  });

  it('marks itself nested, so its fields take no second inset', async () => {
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('.shell-form')?.classList.contains('shell-form--nested')).toBe(true);
    expect(container.querySelector('#Form_Block_Title')?.parentElement?.className).toBe('shell-form__field');
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

describe('FormSchemaForm hooks', () => {
  const submitForm = () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  it('runs onBeforeFormSubmit before posting and cancels when a handler answers false', async () => {
    const order: Array<string> = [];
    let allow = false;
    disposers.push(
      registerHook('test', 'onBeforeFormSubmit', async ({ formId, action, values }) => {
        order.push(`handler ${formId} ${action} ${values.Title}`);
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
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(order).toEqual(['handler Form_Block action_save New']);
    allow = true;
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(order).toEqual(['handler Form_Block action_save New', 'handler Form_Block action_save New', 'post']);
  });

  it('shows the message of an onBeforeFormSubmit handler that throws and does not post', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    disposers.push(
      registerHook('test', 'onBeforeFormSubmit', () => {
        throw new Error('Block failed');
      }),
    );
    const handle = React.createRef<FormSchemaFormHandle>();
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} />);
    let result: unknown;
    await act(async () => {
      result = await handle.current!.submit();
    });
    expect(result).toMatchObject({ ok: false, message: 'Block failed' });
    expect(submitFormSchema).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Block failed');
    vi.mocked(console.error).mockRestore();
  });

  it('posts what an onBeforeFormSubmit handler writes into a field', async () => {
    const handle = React.createRef<FormSchemaFormHandle>();
    disposers.push(
      registerHook('test', 'onBeforeFormSubmit', () => {
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

  it('validates and posts what an updateFormValues handler returns', async () => {
    disposers.push(registerShellValidation());
    const required = { ...response, schema: { ...response.schema, fields: [{ ...titleField, validation: { required: true } }] } };
    vi.mocked(fetchFormSchema).mockResolvedValue(required as never);
    let pending = 'Pending';
    disposers.push(registerHook('test', 'updateFormValues', (values, { formId }) => (formId === 'Form_Block' ? { ...values, Title: pending } : values)));
    const handle = React.createRef<FormSchemaFormHandle>();
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} />);
    type('');
    await act(async () => {
      await handle.current!.submit();
    });
    const [, body] = vi.mocked(submitFormSchema).mock.calls[0];
    expect(String(body)).toContain('Title=Pending');

    pending = '';
    type('Typed');
    await act(async () => {
      await handle.current!.submit();
    });
    expect(submitFormSchema).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Title is required.');

    // The fix arrives through the hook, not typing, so nothing re-validated the field: the next post must still go
    pending = 'Fixed';
    await act(async () => {
      await handle.current!.submit();
    });
    expect(submitFormSchema).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('Title is required.');
  });

  it('renders the schema updateFormSchema returns, with the form id as context', async () => {
    const contexts: Array<unknown> = [];
    disposers.push(
      registerHook('test', 'updateFormSchema', (schema, context) => {
        contexts.push(context);
        return { ...schema, fields: schema.fields.map((field) => ({ ...field, id: 'Form_Block_Renamed' })) };
      }),
    );
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('#Form_Block_Renamed')).not.toBeNull();
    expect(contexts[0]).toEqual({ formId: 'Form_Block' });
  });

  it('applies an updateFormSchema handler registered after the form loaded', async () => {
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('#Form_Block_Title')).not.toBeNull();
    act(() => {
      disposers.push(registerHook('test', 'updateFormSchema', (schema) => ({ ...schema, fields: [] })));
    });
    expect(container.querySelector('#Form_Block_Title')).toBeNull();
  });

  it('hands each field the props updateFieldProps returns', async () => {
    disposers.push(registerHook('test', 'updateFieldProps', (props, { field }) => (field.name === 'Title' ? { ...props, formId: 'Changed' } : props)));
    await render(<FormSchemaForm schemaUrl="schema/Block" headless />);
    expect(container.querySelector('#Form_Block_Title')?.getAttribute('data-form-id')).toBe('Changed');
  });

  it('stops a post the shell validator or an updateFormValidation handler finds invalid', async () => {
    disposers.push(registerShellValidation());
    const required = { ...response, schema: { ...response.schema, fields: [{ ...titleField, validation: { required: true } }] } };
    vi.mocked(fetchFormSchema).mockResolvedValue(required as never);
    const handle = React.createRef<FormSchemaFormHandle>();
    await render(<FormSchemaForm schemaUrl="schema/Block" headless handleRef={handle} />);
    type('');
    await act(async () => {
      await handle.current!.submit();
    });
    expect(submitFormSchema).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Title is required.');

    disposers.push(
      registerHook('test', 'updateFormValidation', (errors, { values }) => (values.Title === 'Bad' ? { ...errors, Title: ['Not that one'] } : errors), {
        after: ['shell:validation'],
      }),
    );
    type('Bad');
    await act(async () => {
      await handle.current!.submit();
    });
    expect(submitFormSchema).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Not that one');

    type('Good');
    await act(async () => {
      await handle.current!.submit();
    });
    expect(submitFormSchema).toHaveBeenCalledTimes(1);
  });

  it('asks onBeforeFormAction before a pressed action and tells onAfterFormSubmit the answer', async () => {
    let allow = false;
    const after = vi.fn();
    disposers.push(
      registerHook('test', 'onBeforeFormAction', ({ action }) => action === 'action_save' && allow),
      registerHook('test', 'onAfterFormSubmit', after),
    );
    await render(<FormSchemaForm schemaUrl="schema/Block" />);
    type('New');
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(submitFormSchema).not.toHaveBeenCalled();
    allow = true;
    await act(async () => {
      submitForm();
    });
    await flush();
    expect(submitFormSchema).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ formId: 'Form_Block', action: 'action_save', response: expect.objectContaining({ errors: [] }) }));
  });
});

describe('FormSchemaForm load failure', () => {
  it('offers to log in again, back to the current page, when the session has ended', async () => {
    vi.mocked(fetchFormSchema).mockRejectedValue(new FormSchemaRequestError(403, null, true));
    await render(<FormSchemaForm schemaUrl="schema/Block" />);
    expect([...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual([expect.stringContaining('Your CMS session has ended')]);
    expect(container.querySelector('a')?.getAttribute('href')).toContain('Security/login?BackURL=');
  });

  it.each([
    ['a section', (error: unknown) => <SectionLoadError error={error} section={{ title: 'Settings' } as ShellSection} />],
    ['a record', (error: unknown) => <RecordLoadError error={error} title="Default Admin" />],
  ])('announces the ended session once on %s page', async (_page, renderLoadError) => {
    vi.mocked(fetchFormSchema).mockRejectedValue(new FormSchemaRequestError(403, null, true));
    await render(<FormSchemaForm schemaUrl="schema/Block" renderLoadError={renderLoadError} />);
    expect([...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual([expect.stringContaining('Your CMS session has ended')]);
  });

  it('names any other failure, with no login link', async () => {
    vi.mocked(fetchFormSchema).mockRejectedValue(new FormSchemaRequestError(404, null, false));
    await render(<FormSchemaForm schemaUrl="schema/Block" />);
    expect(container.textContent).toContain('The form could not be loaded');
    expect(container.querySelector('a')).toBeNull();
  });
});
