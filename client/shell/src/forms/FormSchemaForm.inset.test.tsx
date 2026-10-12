// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import type * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { FormSchemaForm } from './FormSchemaForm';
import { FormSchemaRequestError, fetchFormSchema } from './schema';
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
}));
vi.mock('./useFieldComponent', async () => {
  const { TabItem, Tabs } = await import('@silverstripe/admin-patterns');
  const { ToggleCompositeField } = await import('./fields/ToggleCompositeField');
  const structural: Record<string, React.ComponentType<FieldComponentProps>> = { Tabs, TabItem, ToggleCompositeField };
  return {
    useFullWidthField: (field: { name: string }) => field.name.endsWith('Grid'),
    useFieldComponent:
      ({ component }: { component: string | null }) =>
      (props: FieldComponentProps) => {
        const Structural = component ? structural[component] : undefined;
        if (Structural) {
          return <Structural {...props} />;
        }
        if (props.field.name === 'Nothing') {
          return null;
        }
        return <div id={props.field.id} className={props.field.name.endsWith('Grid') ? undefined : 'admin-field'} />;
      },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = (name: string, schemaType = 'Text', component: string | null = null, children: Array<unknown> = []) => ({
  name,
  id: `Form_EditForm_${name}`,
  type: 'text',
  schemaType,
  component,
  title: name,
  readOnly: false,
  disabled: false,
  data: [],
  children,
});

const tabSet = (name: string, tabs: Array<unknown>) => field(name, 'Structural', 'Tabs', tabs);
const tab = (name: string, children: Array<unknown>) => field(name, 'Structural', 'TabItem', children);

const defaultFields = [field('Title'), field('Grid'), field('ID', 'Hidden'), field('Nothing')];

let container: HTMLDivElement;

afterEach(() => {
  container.remove();
  // Each test loads its own schema under the same key
  serverQueryClient.clear();
});

async function render(element: React.ReactElement, fields: Array<unknown> = defaultFields) {
  vi.mocked(fetchFormSchema).mockResolvedValue({
    id: 'EditForm',
    schema: { id: 'EditForm', name: 'EditForm', action: 'save', method: 'post', attributes: {}, fields, actions: [] },
    state: { id: 'EditForm', fields: [], messages: [{ type: 'good', value: 'Saved.' }] },
  } as never);
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => createRoot(container).render(element));
  await settle();
}

// The server cache hands results over on a timer
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const wrapperOf = (id: string) => container.querySelector(`#${id}`)?.parentElement?.className;

// The stylesheets are not loaded by the test runner, and the inset is a token chain across them
// happy-dom ignores rules inside @layer, so a shell stylesheet's wrapper comes off before it parses the sheet
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^@layer [\w.]+ \{\n([\s\S]*)\n\}\n$/m, '$1');

const loadStyles = (...paths: Array<string>) => {
  const style = document.createElement('style');
  style.textContent = `:root { --shell-inset: 1.6rem; } ${paths.map(read).join(' ')}`;
  document.head.append(style);
  return style;
};

const insetOf = (element: Element | null | undefined, property: 'margin-inline' | 'padding-inline') =>
  element ? getComputedStyle(element).getPropertyValue(property) : null;

describe('FormSchemaForm content inset', () => {
  it('wraps each top-level field and message in an inset wrapper, and a full-width field in its modifier', async () => {
    await render(<FormSchemaForm schemaUrl="admin/form" />);
    expect(wrapperOf('Form_EditForm_Title')).toBe('shell-form__field');
    expect(wrapperOf('Form_EditForm_Grid')).toBe('shell-form__field shell-form__field--full');
    expect(container.querySelector('.admin-alert')?.parentElement?.className).toBe('shell-form__field');
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
    serverQueryClient.clear();
    container = document.createElement('div');
    document.body.append(container);
    // A status under 500, which the cache does not retry
    vi.mocked(fetchFormSchema).mockRejectedValue(new FormSchemaRequestError(404, null, false));
    await act(async () =>
      createRoot(container).render(<FormSchemaForm schemaUrl="admin/form" headless renderLoadError={() => <p id="LoadError" />} />),
    );
    await settle();
    expect(wrapperOf('LoadError')).toBe('shell-form__field');
    expect(container.querySelector('.shell-form')?.className).toBe('shell-form shell-form--nested');
  });

  it('insets a form message by the form inset, and not in a nested form', async () => {
    const style = loadStyles('./form.css', '../../../patterns/src/FieldHolder.css');
    await render(<FormSchemaForm schemaUrl="admin/form" />);
    expect(insetOf(container.querySelector('.admin-alert'), 'margin-inline')).toBe('1.6rem');
    container.remove();
    serverQueryClient.clear();
    await render(<FormSchemaForm schemaUrl="admin/form" headless />);
    expect(insetOf(container.querySelector('.admin-alert'), 'margin-inline')).toBe('0rem');
    style.remove();
  });

  it('insets a disclosure and leaves its fields to the panel padding', async () => {
    const style = loadStyles(
      './form.css',
      './fields/toggle-composite-field.css',
      '../../../patterns/src/Disclosure.css',
      '../../../patterns/src/FieldHolder.css',
    );
    await render(<FormSchemaForm schemaUrl="admin/form" />, [field('Group', 'Structural', 'ToggleCompositeField', [field('Inside')])]);
    expect(insetOf(container.querySelector('#Form_EditForm_Group'), 'margin-inline')).toBe('1.6rem');
    expect(insetOf(container.querySelector('#Form_EditForm_Inside'), 'padding-inline')).toBe('0rem');
    style.remove();
  });

  describe('inside a tab set', () => {
    const tabbedFields = [
      tabSet('Root', [
        tab('Main', [field('Content'), field('PageGrid')]),
        tab('Settings', [tabSet('Nested', [tab('Inner', [field('InnerTitle'), field('InnerGrid')])])]),
      ]),
    ];

    it('spans the content column with the tab set and insets its tab strip', async () => {
      // The stylesheets are not loaded by the test runner, and the inset is a token chain across both
      const style = document.createElement('style');
      style.textContent = `:root { --shell-inset: 1.6rem; } ${read('./form.css')} ${read('../../../patterns/src/TabStrip.css')} ${read('../../../patterns/src/FieldHolder.css')}`;
      document.head.append(style);
      await render(<FormSchemaForm schemaUrl="admin/form" />, tabbedFields);
      const paddingOf = (element: Element | null | undefined) => (element ? getComputedStyle(element).getPropertyValue('padding-inline') : null);
      expect(wrapperOf('Form_EditForm_Root')).toBe('shell-form__field shell-form__field--tabs');
      expect(paddingOf(container.querySelector('#Form_EditForm_Root > .admin-tab-strip'))).toBe('1.6rem');
      const contentHolder = container.querySelector('#Form_EditForm_Content')?.closest('.admin-field');
      expect(paddingOf(contentHolder)).toBe('1.6rem');
      expect(container.querySelector('#Form_EditForm_PageGrid')?.closest('.admin-field')).toBeNull();
      style.remove();
    });

    it('breaks a grid inside a tab out to the edges', async () => {
      await render(<FormSchemaForm schemaUrl="admin/form" />, tabbedFields);
      expect(wrapperOf('Form_EditForm_PageGrid')).toBe('shell-form__field shell-form__field--full');
      expect(container.querySelector('#Form_EditForm_PageGrid')?.closest('[role="tabpanel"]')).not.toBeNull();
    });

    it('keeps the inset on a text field inside a tab', async () => {
      await render(<FormSchemaForm schemaUrl="admin/form" />, tabbedFields);
      expect(wrapperOf('Form_EditForm_Content')).toBe('shell-form__field');
    });

    it('lays out a tab set nested in a tab the same way', async () => {
      await render(<FormSchemaForm schemaUrl="admin/form" />, tabbedFields);
      expect(wrapperOf('Form_EditForm_Nested')).toBe('shell-form__field shell-form__field--tabs');
      expect(wrapperOf('Form_EditForm_InnerGrid')).toBe('shell-form__field shell-form__field--full');
      expect(wrapperOf('Form_EditForm_InnerTitle')).toBe('shell-form__field');
    });
  });
});
