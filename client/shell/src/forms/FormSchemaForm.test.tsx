// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema } from './schema';

vi.mock('piral-core', () => ({ useGlobalStateContext: () => ({}) }));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./schema')>()),
  fetchFormSchema: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

afterEach(() => container.remove());

async function renderWithMessages(messages: Array<{ type: string; value: string }>) {
  vi.mocked(fetchFormSchema).mockResolvedValue({
    id: 'EditForm',
    schema: { id: 'EditForm', name: 'EditForm', action: 'save', method: 'post', attributes: {}, fields: [], actions: [] },
    state: { id: 'EditForm', fields: [], messages },
  } as never);
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => createRoot(container).render(<FormSchemaForm schemaUrl="admin/form" />));
}

describe('FormSchemaForm messages', () => {
  it('shows a good or success message as a status in the success style', async () => {
    await renderWithMessages([{ type: 'good', value: 'Saved.' }, { type: 'success', value: 'Published.' }]);
    const alerts = Array.from(container.querySelectorAll('.shell-form__alert'));
    expect(alerts.map((alert) => [alert.getAttribute('role'), alert.className])).toEqual([
      ['status', 'shell-form__alert shell-form__alert--good'],
      ['status', 'shell-form__alert shell-form__alert--good'],
    ]);
  });

  it('shows any other message as an alert', async () => {
    await renderWithMessages([{ type: 'error', value: 'Failed.' }]);
    const alert = container.querySelector('.shell-form__alert')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.className).toBe('shell-form__alert');
  });
});
