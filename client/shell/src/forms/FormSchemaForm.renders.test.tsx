// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema, submitFormSchema } from './schema';
import { serverQueryClient } from '../state/serverCache';
import type { FieldComponentProps, FormSchemaResponse } from './types';

const renders = vi.hoisted(() => ({ count: 0, submitting: new Set<boolean>() }));

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
vi.mock('./useFieldComponent', () => {
  const CountedField = ({ field, value, onChange, submitting }: FieldComponentProps<string>) => {
    renders.count += 1;
    renders.submitting.add(submitting);
    return <input id={field.id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
  };
  const Action = ({ field }: FieldComponentProps) => (
    <button type="submit" name={field.name} id={field.id}>
      Save
    </button>
  );
  return {
    useFullWidthField: () => false,
    useFieldComponent: (field: { type: string }) => (field.type === 'submit' ? Action : CountedField),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fieldCount = 60;
const textField = (index: number) => ({
  name: `Field${index}`,
  id: `Form_Big_Field${index}`,
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: `Field ${index}`,
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
});
const fields = Array.from({ length: fieldCount }, (_, index) => textField(index));
const response = {
  id: 'schema/Big',
  schema: {
    id: 'schema/Big',
    name: 'Big',
    action: 'admin/big/save',
    method: 'POST',
    attributes: { id: 'Form_Big' },
    fields,
    actions: [{ ...textField(0), name: 'action_save', id: 'Form_Big_action_save', type: 'submit', schemaType: null, component: 'FormAction', title: 'Save' }],
  },
  state: { id: 'Form_Big', fields: fields.map(({ name, id }) => ({ name, id, value: '', message: null, data: [] })), messages: [] },
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

afterEach(() => {
  serverQueryClient.clear();
  act(() => root.unmount());
  container.remove();
});

describe('FormSchemaForm render cost', () => {
  it('re-renders only the edited field on the first keystroke, and every field once posting starts', async () => {
    vi.mocked(fetchFormSchema).mockResolvedValue(response as never);
    let finishPost: (value: FormSchemaResponse) => void = () => undefined;
    vi.mocked(submitFormSchema).mockImplementation(() => new Promise((resolve) => (finishPost = resolve)));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<FormSchemaForm schemaUrl="schema/Big" />));
    await flush();
    expect(container.querySelectorAll('input')).toHaveLength(fieldCount);

    renders.count = 0;
    const input = container.querySelector<HTMLInputElement>('#Form_Big_Field0')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'N');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(renders.count).toBeLessThanOrEqual(2);

    renders.submitting.clear();
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(renders.submitting.has(true)).toBe(true);
    await act(async () => finishPost({ ...response, errors: [] } as never));
    await flush();
  });
});
