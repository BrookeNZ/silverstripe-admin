// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPreviewBarSlot } from '../preview/barSlot';
import { previewModeMenuId } from '../preview/PreviewModeMenu';
import { resetPreviewMode, setPreviewMode } from '../preview/mode';
import { FormSchemaForm } from './FormSchemaForm';
import { fetchFormSchema } from './schema';

const shellState = vi.hoisted(() => ({ sectionHeader: { current: null, entries: [] as Array<unknown> } }));

vi.mock('piral-core', () => ({
  useGlobalStateContext: () => ({}),
  useGlobalState: (select: (state: typeof shellState) => unknown) => select(shellState),
}));
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./schema')>()),
  fetchFormSchema: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let wide = true;

beforeEach(() => {
  wide = true;
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: () => undefined, removeEventListener: () => undefined }));
  window.localStorage.clear();
  resetPreviewMode();
  shellState.sectionHeader.entries = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderWithMessages(messages: Array<{ type: string; value: string }>, previewControls?: React.ReactNode) {
  vi.mocked(fetchFormSchema).mockResolvedValue({
    id: 'EditForm',
    schema: { id: 'EditForm', name: 'EditForm', action: 'save', method: 'post', attributes: {}, fields: [], actions: [] },
    state: { id: 'EditForm', fields: [], messages },
  } as never);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<FormSchemaForm schemaUrl="admin/form" previewControls={previewControls} />));
}

function withPreview() {
  shellState.sectionHeader.entries = [{ id: 1, owner: 'pages', header: { title: 'About', preview: 'https://example.test/about/' } }];
}

const stageToggle = <button type="button">Stage</button>;

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

describe('FormSchemaForm action bar preview controls', () => {
  it('draws no right-hand group when the page has no preview', async () => {
    act(() => setPreviewMode('split'));
    await renderWithMessages([], stageToggle);
    expect(container.querySelector('.shell-form__actions-end')).toBeNull();
    expect(document.getElementById(previewModeMenuId)).toBeNull();
  });

  it('ends the bar with Share and the mode menu, without the host controls, in edit mode', async () => {
    withPreview();
    await renderWithMessages([], stageToggle);
    const end = container.querySelector('form .shell-form__actions .shell-form__actions-end');
    expect(end?.children).toHaveLength(1);
    const tools = end?.querySelector('.shell-preview-tools');
    expect(tools?.firstElementChild?.textContent).toBe('Share');
    expect(tools?.firstElementChild?.hasAttribute('disabled')).toBe(true);
    expect(tools?.querySelector(`#${previewModeMenuId}`)?.textContent).toBe('Edit mode');
  });

  it('puts the host controls before Share in split mode', async () => {
    withPreview();
    act(() => setPreviewMode('split'));
    await renderWithMessages([], stageToggle);
    const end = container.querySelector('form .shell-form__actions .shell-form__actions-end');
    expect(end?.firstElementChild?.textContent).toBe('Stage');
    expect(end?.querySelector(`#${previewModeMenuId}`)?.textContent).toBe('Split mode');
  });

  it('draws and drops the host controls as the mode changes', async () => {
    withPreview();
    await renderWithMessages([], stageToggle);
    const stageButton = () => Array.from(container.querySelectorAll('.shell-form__actions-end button')).find((button) => button.textContent === 'Stage');
    expect(stageButton()).toBeUndefined();
    act(() => setPreviewMode('split'));
    expect(stageButton()).toBeDefined();
    act(() => setPreviewMode('edit'));
    expect(stageButton()).toBeUndefined();
  });

  it('keeps the group off a viewport too narrow for a preview, whatever the chosen mode', async () => {
    withPreview();
    wide = false;
    act(() => setPreviewMode('split'));
    await renderWithMessages([], stageToggle);
    expect(document.getElementById(previewModeMenuId)).toBeNull();
    expect(container.querySelector('.shell-form__actions-end')).toBeNull();
  });

  it('draws only the right-hand group, host controls first, at the foot of the preview pane in preview mode', async () => {
    withPreview();
    const slot = document.createElement('div');
    document.body.append(slot);
    act(() => {
      setPreviewMode('preview');
      setPreviewBarSlot(slot);
    });
    await renderWithMessages([], stageToggle);
    expect(container.querySelector('.shell-form__actions')).toBeNull();
    const bar = slot.querySelector('.shell-form__actions');
    expect(bar?.children).toHaveLength(1);
    expect(bar?.firstElementChild?.className).toBe('shell-form__actions-end');
    expect(bar?.firstElementChild?.firstElementChild?.textContent).toBe('Stage');
    expect(bar?.querySelector(`#${previewModeMenuId}`)?.textContent).toBe('Preview mode');
    act(() => setPreviewBarSlot(null));
    slot.remove();
  });
});
