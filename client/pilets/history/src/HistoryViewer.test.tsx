// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryApi, Version } from './api';
import { HistoryApiError } from './api';
import { createHistoryViewer, recordsChangedEvent } from './HistoryViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const version = (number: number, flags: Partial<Version> = {}): Version => ({
  version: number,
  author: { firstName: 'Default Admin', surname: null },
  publisher: { firstName: '', surname: '' },
  deleted: false,
  draft: true,
  published: false,
  liveVersion: false,
  latestDraftVersion: false,
  lastEdited: '2026-10-07 11:40:04',
  ...flags,
});

let container: HTMLDivElement;
let root: Root;
let client: { read: ReturnType<typeof vi.fn>; revert: ReturnType<typeof vi.fn> };
let emitted: Array<[string, unknown]>;
let toasts: Array<string>;
let formUrls: Array<string>;

const FakeForm = ({ schemaUrl }: { schemaUrl: string }) => {
  formUrls.push(schemaUrl);
  return <p data-form={schemaUrl}>Version form</p>;
};

const field = (data: Record<string, unknown>) =>
  ({
    id: 'Form_EditForm_PageHistory',
    name: 'PageHistory',
    data: { recordId: 1, recordClass: 'Page', isRevertable: true, limit: 2, ...data },
  }) as never;

async function render(data: Record<string, unknown> = {}) {
  const HistoryViewer = createHistoryViewer({
    api: {
      getSilverstripeComponent: () => FakeForm as never,
      showNotification: (content: unknown) => {
        toasts.push(String(content));
        return undefined as never;
      },
      emit: (name: string, value: unknown) => {
        emitted.push([name, value]);
      },
    } as never,
    client: client as unknown as HistoryApi,
    versionSchemaUrl: (recordClass, id, number) => `schema?${recordClass}/${id}/${number}`,
  });
  await act(async () => {
    root.render(<HistoryViewer field={field(data)} value={undefined} onChange={() => undefined} onBlur={() => undefined} submitting={false} renderFields={() => null} />);
  });
}

const buttons = () => Array.from(container.querySelectorAll('button'));
const button = (label: string) => {
  const found = buttons().find((candidate) => candidate.textContent?.trim() === label);
  if (!found) {
    throw new Error(`No button "${label}" in ${buttons().map((candidate) => candidate.textContent).join(', ')}`);
  }
  return found;
};
const click = async (label: string) => {
  await act(async () => {
    button(label).click();
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  emitted = [];
  toasts = [];
  formUrls = [];
  client = {
    read: vi.fn(async (_class: string, _id: number, page: number) =>
      page === 1
        ? { totalCount: 3, versions: [version(3, { published: true, latestDraftVersion: true }), version(2)] }
        : { totalCount: 3, versions: [version(1, { deleted: true })] },
    ),
    revert: vi.fn(async () => undefined),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('HistoryViewer', () => {
  it('lists versions as table rows with status badges and pages through them', async () => {
    await render();

    expect(client.read).toHaveBeenCalledWith('Page', 1, 1, expect.any(AbortSignal));
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.children).map((cell) => cell.textContent?.trim()),
    );
    expect(rows.map((row) => row.slice(0, 3))).toEqual([
      ['Version 3', 'Published', 'Default Admin'],
      ['Version 2', 'Draft', 'Default Admin'],
    ]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('3 versions, page 1 of 2');
    expect(button('Previous').disabled).toBe(true);

    await click('Next');
    expect(client.read).toHaveBeenLastCalledWith('Page', 1, 2, expect.any(AbortSignal));
    expect(container.querySelector('tbody tr')?.textContent).toContain('Archived');
    expect(button('Next').disabled).toBe(true);
  });

  it('opens a version read-only, focuses its heading, and returns focus to its row', async () => {
    await render();
    await click('Version 2');

    expect(formUrls.at(-1)).toBe('schema?Page/1/2');
    expect(document.activeElement?.textContent).toContain('Version 2');
    expect(container.querySelector('table')).toBeNull();

    await click('Back to all versions');
    expect(document.activeElement?.id).toBe('Form_EditForm_PageHistory_version_2');
  });

  it('offers revert for an older version only, and reverts through the client', async () => {
    await render();
    await click('Version 3');
    expect(buttons().map((candidate) => candidate.textContent)).not.toContain('Revert to this version');
    expect(container.textContent).toContain('Revert is unavailable for the current version');

    await click('Back to all versions');
    await click('Version 2');
    await click('Revert to this version');

    expect(client.revert).toHaveBeenCalledWith('Page', 1, 2);
    expect(toasts).toEqual(['Reverted to version 2']);
    expect(emitted).toEqual([[recordsChangedEvent, { recordClass: 'Page', ids: [1] }]]);
    expect(client.read).toHaveBeenCalledTimes(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('Versions');
  });

  it('shows no revert to a member who cannot edit', async () => {
    await render({ isRevertable: false });
    await click('Version 2');
    expect(buttons().map((candidate) => candidate.textContent)).not.toContain('Revert to this version');
    expect(container.textContent).not.toContain('Revert is unavailable');
  });

  it('shows a failed revert in the version view and stays there', async () => {
    client.revert.mockRejectedValueOnce(new HistoryApiError('You do not have permission', 403));
    await render();
    await click('Version 2');
    await click('Revert to this version');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('You do not have permission');
    expect(button('Revert to this version')).toBeTruthy();
    expect(emitted).toEqual([]);
  });

  it('shows a failed read as an alert', async () => {
    client.read.mockRejectedValueOnce(new HistoryApiError('Sorry, it seems there was a 404 error.', 404));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Sorry, it seems there was a 404 error.');
  });
});
