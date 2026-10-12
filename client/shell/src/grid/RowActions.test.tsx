// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionStatus, ConfirmDialog, RowActions } from './GridTable';
import type { GridLinkAction, GridPayload, GridPostAction, GridRow } from './types';

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
const edit: GridLinkAction = { type: 'link', name: 'edit', title: 'Edit', url: 'https://example.test/item/7/edit' };
const row: GridRow = { id: 7, title: 'Endeavour', cells: {}, actions: [edit, archive, restore] };

let container: HTMLDivElement;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(element));
}

afterEach(() => container.remove());

const trigger = () => container.querySelector<HTMLButtonElement>('#Grid_Actions_7')!;
const menuItems = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

// The same wiring GridTable gives a row: a confirm opens the dialog, anything else runs at once
const ConfirmingRow = ({ onRun }: { onRun: (action: GridPostAction) => void }) => {
  const [confirming, setConfirming] = React.useState<{ action: GridPostAction; row: GridRow } | null>(null);
  return (
    <>
      <RowActions gridId="Grid" row={row} readonly={false} onAction={(action) => (action.confirm ? setConfirming({ action, row }) : onRun(action))} />
      <ConfirmDialog confirming={confirming} onCancel={() => setConfirming(null)} onConfirm={() => confirming && onRun(confirming.action)} />
    </>
  );
};

describe('RowActions', () => {
  it('keeps links inline and puts posted actions in a menu named for the row', () => {
    const onAction = vi.fn();
    render(<RowActions gridId="Grid" row={row} readonly={false} onAction={onAction} />);

    expect(container.querySelector('a')?.textContent).toBe('Edit Endeavour');
    expect(trigger().textContent).toBe('Actions for Endeavour');
    expect(trigger().classList.contains('admin-button--tertiary')).toBe(true);
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');

    act(() => trigger().click());
    expect(menuItems().map((item) => item.textContent)).toEqual(['Archive', 'Restore to draft']);
    expect(menuItems()[0].classList.contains('admin-button--danger')).toBe(true);
    expect(menuItems()[1].classList.contains('admin-button--danger')).toBe(false);

    act(() => menuItems()[1].click());
    expect(onAction).toHaveBeenCalledWith(restore);
  });

  it('leaves the menu out of a read-only grid', () => {
    render(<RowActions gridId="Grid" row={row} readonly onAction={() => undefined} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelector('a')).not.toBeNull();
  });

  it('confirms an action chosen from the menu before running it', () => {
    const onRun = vi.fn();
    render(<ConfirmingRow onRun={onRun} />);

    act(() => trigger().click());
    act(() => menuItems()[0].click());
    expect(onRun).not.toHaveBeenCalled();
    const dialog = container.querySelector('dialog')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Archive Endeavour?');

    const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Archive')!;
    act(() => confirm.click());
    expect(onRun).toHaveBeenCalledWith(archive);
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
