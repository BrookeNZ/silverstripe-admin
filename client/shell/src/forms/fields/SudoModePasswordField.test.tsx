// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateShellServerCache } from '../../state/serverCache';
import { fetchJson, ServerRequestError } from '../../state/serverRequest';
import type { FieldComponentProps } from '../types';
import { SudoModePasswordField, sudoModeControllerName } from './SudoModePasswordField';

vi.mock('../../state/serverCache', () => ({ invalidateShellServerCache: vi.fn(async () => undefined) }));
vi.mock('../../state/serverRequest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/serverRequest')>()),
  fetchJson: vi.fn(),
}));
vi.mock('../../state/sharedState', () => ({
  sharedConfig: () => ({
    sections: [{ name: sudoModeControllerName, url: 'admin/sudomode', endpoints: { activate: 'admin/sudomode/activate/' }, helpLink: null }],
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = {
  key: 'SudoModePasswordField-1',
  name: 'SudoModePasswordField-1',
  id: 'Form_EditForm_SudoModePasswordField-1',
  holderId: 'Form_EditForm_SudoModePasswordField-1_Holder',
  title: '',
  type: 'password',
  schemaType: 'Text',
  component: 'SudoModePasswordField',
  attributes: { autocomplete: 'off', 'data-initially-collapsed': false, 'data-for-gridfield': false, 'data-section-title': '' },
  readOnly: false,
  disabled: false,
  data: {},
  source: [],
  children: [],
} as unknown as FieldComponentProps['field'];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const props = { field, value: '', onChange: vi.fn(), onBlur: () => undefined, submitting: false, renderFields: () => null } as unknown as FieldComponentProps;
  act(() => root.render(<SudoModePasswordField {...props} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.mocked(fetchJson).mockReset();
  vi.mocked(invalidateShellServerCache).mockClear();
});

const button = (text: string) => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === text)!;

async function verifyWith(password: string): Promise<void> {
  act(() => button('Verify to continue').click());
  const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, password);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Verify').click());
}

describe('SudoModePasswordField', () => {
  it('shows the read-only notice, then asks for the password', () => {
    expect(container.textContent).toContain('This section is protected and is in read-only mode.');
    expect(container.querySelector('input')).toBeNull();
    act(() => button('Verify to continue').click());
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(input.name).toBe('');
    expect(container.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Enter your password');
  });

  it('shows the server\'s message for a wrong password and stays', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new ServerRequestError('Incorrect password', 401, true, 'Incorrect password'));
    await verifyWith('wrong');
    expect(container.querySelector('.admin-field__message')?.textContent).toBe('Incorrect password');
    expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(invalidateShellServerCache).not.toHaveBeenCalled();
  });

  it('posts the password to the activate endpoint, then refetches the form and hides itself', async () => {
    vi.mocked(fetchJson).mockResolvedValue([]);
    await verifyWith('password');
    const [url, init] = vi.mocked(fetchJson).mock.calls[0];
    expect(url).toBe('admin/sudomode/activate/');
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toBe('Password=password');
    expect(invalidateShellServerCache).toHaveBeenCalledOnce();
    expect(container.innerHTML).toBe('');
  });
});
