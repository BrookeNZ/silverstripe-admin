// @vitest-environment happy-dom
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { FormRenderContext } from './context';
import type { FormRenderContextValue } from './context';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema } from './schema';
import { serverQueryClient } from '../state/serverCache';
import type { FieldComponentProps } from './types';
import { useFormFieldValue } from './useFormFieldValue';

vi.mock('piral-core', () => ({
  useGlobalStateContext: () => ({}),
  useGlobalState: (select: (state: unknown) => unknown) => select({ sectionHeader: { current: null, entries: [] } }),
}));
vi.mock('../unsaved', () => ({ setUnsavedChanges: () => () => undefined, shellOwner: 'shell' }));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaModule>()),
  fetchFormSchema: vi.fn(),
}));

const Watcher = ({ field }: { field: { id: string; name: string } }) => {
  const watched = useFormFieldValue(field.name === 'Watcher' ? 'Title' : 'NotPosted');
  return <output id={field.id}>{watched === undefined ? 'undefined' : String(watched)}</output>;
};

vi.mock('./useFieldComponent', () => ({
  useFullWidthField: () => false,
  useFieldComponent: (field: { name: string }) =>
    field.name === 'Title'
      ? ({ field: own, value, onChange }: FieldComponentProps<string>) => (
          <input id={own.id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
        )
      : Watcher,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const textField = (name: string) => ({
  name,
  id: `Form_Page_${name}`,
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: name,
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
});

const response = {
  id: 'schema/Page',
  schema: {
    id: 'schema/Page',
    name: 'Page',
    action: 'admin/page/save',
    method: 'POST',
    attributes: { id: 'Form_Page' },
    fields: [textField('Title'), textField('Watcher'), { ...textField('Unposted'), schemaType: 'Structural' }],
    actions: [],
  },
  state: {
    id: 'Form_Page',
    fields: [
      { name: 'Title', id: 'Form_Page_Title', value: 'About', message: null, data: [] },
      { name: 'Watcher', id: 'Form_Page_Watcher', value: '', message: null, data: [] },
    ],
    messages: [],
  },
};

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  serverQueryClient.clear();
  act(() => root.unmount());
  container.remove();
});

async function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(element));
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve));
    }
  });
}

describe('useFormFieldValue', () => {
  it('lets a field read a sibling and re-render as it changes', async () => {
    vi.mocked(fetchFormSchema).mockResolvedValue(response as never);
    await render(<FormSchemaForm schemaUrl="schema/Page" headless />);
    const output = () => container.querySelector('#Form_Page_Watcher')?.textContent;
    expect(output()).toBe('About');

    const input = container.querySelector<HTMLInputElement>('#Form_Page_Title')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'About us');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(output()).toBe('About us');
    expect(container.querySelector('#Form_Page_Unposted')?.textContent).toBe('undefined');
  });

  it('stops watching when the field unmounts', async () => {
    const unsubscribe = vi.fn();
    const subscribeValues = vi.fn(() => unsubscribe);
    const context = { boundKeys: new Set(['Title']), getValue: () => 'About', subscribeValues } as unknown as FormRenderContextValue;
    const Probe = () => <span>{String(useFormFieldValue('Title'))}</span>;
    await render(
      <FormRenderContext value={context}>
        <Probe />
      </FormRenderContext>,
    );
    expect(container.textContent).toBe('About');
    expect(subscribeValues).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<FormRenderContext value={context}>{null}</FormRenderContext>));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is undefined outside a form', async () => {
    const Probe = () => <span>{String(useFormFieldValue('Title'))}</span>;
    await render(<Probe />);
    expect(container.textContent).toBe('undefined');
  });
});
