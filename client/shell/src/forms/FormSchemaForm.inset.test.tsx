// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema } from './schema';
import type { FieldComponentProps } from './types';

vi.mock('piral-core', () => ({ useGlobalStateContext: () => ({}) }));
vi.mock('../unsaved', () => ({ setUnsavedChanges: () => () => undefined, shellOwner: 'shell' }));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./schema')>()),
  fetchFormSchema: vi.fn(),
}));
vi.mock('./useFieldComponent', () => ({
  useFullWidthField: (field: { name: string }) => field.name === 'Grid',
  useFieldComponent: () => ({ field }: FieldComponentProps) => (field.name === 'Nothing' ? null : <div id={field.id} />),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = (name: string, schemaType = 'Text') => ({
  name,
  id: `Form_EditForm_${name}`,
  type: 'text',
  schemaType,
  component: null,
  title: name,
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
});

let container: HTMLDivElement;

afterEach(() => container.remove());

async function render(element: React.ReactElement) {
  vi.mocked(fetchFormSchema).mockResolvedValue({
    id: 'EditForm',
    schema: { id: 'EditForm', name: 'EditForm', action: 'save', method: 'post', attributes: {}, fields: [field('Title'), field('Grid'), field('ID', 'Hidden'), field('Nothing')], actions: [] },
    state: { id: 'EditForm', fields: [], messages: [{ type: 'good', value: 'Saved.' }] },
  } as never);
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => createRoot(container).render(element));
}

const wrapperOf = (id: string) => container.querySelector(`#${id}`)?.parentElement?.className;

describe('FormSchemaForm content inset', () => {
  it('wraps each top-level field and message in an inset wrapper, and a full-width field in its modifier', async () => {
    await render(<FormSchemaForm schemaUrl="admin/form" />);
    expect(wrapperOf('Form_EditForm_Title')).toBe('shell-form__field');
    expect(wrapperOf('Form_EditForm_Grid')).toBe('shell-form__field shell-form__field--full');
    expect(container.querySelector('.shell-form__alert')?.parentElement?.className).toBe('shell-form__field');
    expect(container.querySelector('form')?.className).not.toContain('shell-form--nested');
  });

  it('leaves a hidden field unwrapped and lets the wrapper of a field that renders nothing match :empty', async () => {
    await render(<FormSchemaForm schemaUrl="admin/form" />);
    expect(container.querySelector('#Form_EditForm_ID')?.parentElement?.tagName).toBe('FORM');
    const wrappers = Array.from(container.querySelectorAll('form > .shell-form__field'));
    expect(wrappers).toHaveLength(4);
    expect(wrappers.filter((wrapper) => wrapper.matches(':empty'))).toHaveLength(1);
  });

  it('insets the loading status and a load error the same way', async () => {
    container = document.createElement('div');
    document.body.append(container);
    vi.mocked(fetchFormSchema).mockReturnValue(new Promise(() => undefined));
    await act(async () => createRoot(container).render(<FormSchemaForm schemaUrl="admin/form" />));
    expect(container.querySelector('.shell-form__status')?.parentElement?.className).toBe('shell-form__field');

    container.remove();
    container = document.createElement('div');
    document.body.append(container);
    vi.mocked(fetchFormSchema).mockRejectedValue(new Error('Gone'));
    await act(async () =>
      createRoot(container).render(<FormSchemaForm schemaUrl="admin/form" headless renderLoadError={() => <p id="LoadError" />} />),
    );
    expect(wrapperOf('LoadError')).toBe('shell-form__field');
    expect(container.querySelector('.shell-form')?.className).toBe('shell-form shell-form--nested');
  });
});
