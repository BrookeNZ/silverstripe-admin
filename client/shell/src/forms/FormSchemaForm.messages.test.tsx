// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SchemaModule from './schema';
import { announceDelay, LiveAnnouncer } from '../announcer';
import { NotificationsToast } from '../notifications';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema, submitFormSchema } from './schema';
import { recordsChangedEvent } from '../events';
import { serverQueryClient } from '../state/serverCache';
import type { FieldComponentProps, SchemaMessage } from './types';

const globalContext = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('piral-core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGlobalStateContext: () => globalContext,
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
    ({ field, value, onChange }: FieldComponentProps<string>) =>
      field.type === 'submit' ? (
        <button type="submit" name={field.name} id={field.id}>
          Save
        </button>
      ) : (
        <input id={field.id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const titleField = {
  name: 'Title',
  id: 'Form_EditForm_Title',
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: 'Title',
  readOnly: false,
  disabled: false,
  data: [],
  children: [],
};

const saveAction = { ...titleField, name: 'action_save', id: 'Form_EditForm_action_save', type: 'submit', schemaType: null, component: 'FormAction', title: 'Save' };

const state = { id: 'Form_EditForm', fields: [{ name: 'Title', id: 'Form_EditForm_Title', value: 'Old', message: null, data: [] }], messages: [] };

const response = {
  id: 'admin/settings/schema',
  schema: {
    id: 'admin/settings/schema',
    name: 'EditForm',
    action: 'admin/settings/EditForm',
    method: 'POST',
    attributes: { id: 'Form_EditForm' },
    fields: [titleField],
    actions: [saveAction],
  },
  state,
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

function answer(messages: Array<SchemaMessage>, errors: Array<SchemaMessage> = []) {
  vi.mocked(submitFormSchema).mockResolvedValue({ ...response, state: { ...state, messages }, errors } as never);
}

async function save() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

const alerts = () => Array.from(container.querySelectorAll('form .admin-alert')).map((alert) => [alert.getAttribute('role'), alert.textContent]);

beforeEach(() => {
  vi.mocked(fetchFormSchema).mockResolvedValue(response as never);
  vi.mocked(submitFormSchema).mockReset();
});

afterEach(() => {
  serverQueryClient.clear();
  act(() => root.unmount());
  container.remove();
});

describe('FormSchemaForm post messages', () => {
  it('hands a good message to onMessage once and draws nothing inline', async () => {
    const onMessage = vi.fn();
    answer([{ type: 'good', value: 'Saved.' }]);
    await render(<FormSchemaForm schemaUrl="admin/settings/schema" onMessage={onMessage} />);
    await save();
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: 'good', value: 'Saved.' });
    expect(alerts()).toEqual([]);
  });

  it('keeps errors and warnings inline and hands only the good message on', async () => {
    const onMessage = vi.fn();
    answer([{ type: 'good', value: 'Saved.' }, { type: 'warning', value: 'Check the slug.' }], [{ type: 'error', value: 'Server broke.' }]);
    await render(<FormSchemaForm schemaUrl="admin/settings/schema" onMessage={onMessage} />);
    await save();
    expect(onMessage.mock.calls).toEqual([[{ type: 'good', value: 'Saved.' }]]);
    expect(alerts()).toEqual([
      ['alert', 'Server broke.'],
      ['alert', 'Check the slug.'],
    ]);
  });

  it('keeps the good message inline for a form with no onMessage, as a dialog', async () => {
    answer([{ type: 'good', value: 'Saved.' }]);
    await render(<FormSchemaForm schemaUrl="admin/settings/schema" />);
    await save();
    expect(alerts()).toEqual([['status', 'Saved.']]);
  });

  it('announces a saved message once, through the polite region', async () => {
    const Host = () => {
      const [toasts, setToasts] = React.useState<Array<string>>([]);
      return (
        <>
          <LiveAnnouncer />
          <FormSchemaForm schemaUrl="admin/settings/schema" onMessage={(message) => setToasts((shown) => [...shown, message.value])} />
          {toasts.map((text) => (
            <NotificationsToast key={text} onClose={() => undefined} options={{ type: 'success', dismissAfter: 0 }}>
              {text}
            </NotificationsToast>
          ))}
        </>
      );
    };
    answer([{ type: 'good', value: 'Saved.' }]);
    await render(<Host />);
    await save();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, announceDelay + 20));
    });
    const live = Array.from(container.querySelectorAll('[role="status"], [role="alert"]')).filter((region) => region.textContent?.includes('Saved.'));
    expect(live).toHaveLength(1);
    expect(live[0].className).toBe('shell__announcer');
    expect(live[0].getAttribute('role')).toBe('status');
    expect(container.querySelectorAll('.admin-toast')).toHaveLength(1);
  });
});

describe('FormSchemaForm saved record', () => {
  it("announces a saved record that names no class under the schema's record class, as AssetAdmin's save answers", async () => {
    vi.mocked(fetchFormSchema).mockResolvedValue({ ...response, schema: { ...response.schema, recordClass: 'SilverStripe\\Assets\\Image' } } as never);
    vi.mocked(submitFormSchema).mockResolvedValue({ ...response, record: { id: 40, title: 'Wordmark', exists: true } } as never);
    globalContext.emit.mockClear();
    await render(<FormSchemaForm schemaUrl="admin/assets/schema/fileEditForm/40" />);
    await save();
    expect(globalContext.emit).toHaveBeenCalledWith(recordsChangedEvent, { recordClass: 'SilverStripe\\Assets\\Image', ids: [40] });
  });
});
