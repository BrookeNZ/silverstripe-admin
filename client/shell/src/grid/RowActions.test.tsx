// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionStatus, RowActions } from './GridTable';
import type { GridPayload, GridPostAction, GridRow } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const archive: GridPostAction = {
  type: 'action',
  name: 'archiverecord',
  title: 'Archive',
  method: 'POST',
  url: 'actions/archiverecord',
  args: { RecordID: 7 },
  confirm: 'Are you sure you want to archive this record?',
};
const restore: GridPostAction = { ...archive, name: 'restore', title: 'Restore to draft', url: 'actions/restore', confirm: null };
const row: GridRow = { id: 7, title: 'Endeavour', cells: {}, actions: [archive, restore] };

let container: HTMLDivElement;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
}

afterEach(() => container.remove());

describe('RowActions', () => {
  it('renders posted actions as text buttons named with the row', () => {
    const onAction = vi.fn();
    render(<RowActions row={row} readonly={false} onAction={onAction} />);

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Archive Endeavour', 'Restore to draft Endeavour']);
    expect(buttons.every((button) => button.classList.contains('admin-button--text') && button.type === 'button')).toBe(true);
    expect(buttons[0].querySelector('.admin-grid__hidden')?.textContent).toBe(' Endeavour');

    act(() => buttons[1].click());
    expect(onAction).toHaveBeenCalledWith(restore);
  });

  it('leaves posted actions out of a read-only grid', () => {
    render(<RowActions row={row} readonly onAction={() => undefined} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('actionStatus', () => {
  const payload = { rows: [] } as unknown as GridPayload;

  // The endpoint strips RestoreAction's edit link and decodes its entities before sending the message
  it('announces the server message when the action sent one', () => {
    const message = 'Successfully restored the ship "Endeavour & Co"';
    expect(actionStatus(restore, row, { ...payload, message })).toBe(message);
  });

  it('otherwise names the action and the row', () => {
    expect(actionStatus(archive, row, payload)).toBe('Archive: Endeavour done');
    expect(actionStatus(archive, { ...row, title: null }, payload)).toBe('Archive: #7 done');
  });
});
