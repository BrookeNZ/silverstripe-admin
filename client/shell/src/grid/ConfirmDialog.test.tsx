// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmDialog } from './GridTable';
import type { GridPostAction, GridRow } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const action: GridPostAction = { type: 'action', name: 'deleterecord', title: 'Delete', method: 'POST', url: 'rows', args: { RecordID: 1 }, confirm: 'Sure?' };

function row(title: string): GridRow {
  return { id: 1, title, cells: {}, actions: [action] };
}

let container: HTMLDivElement;

afterEach(() => container.remove());

describe('ConfirmDialog', () => {
  it('labels each grid’s dialog by its own title when two grids share a page', () => {
    container = document.createElement('div');
    document.body.append(container);
    const noop = () => undefined;
    act(() =>
      createRoot(container).render(
        <>
          <ConfirmDialog confirming={{ action, row: row('First') }} onCancel={noop} onConfirm={noop} />
          <ConfirmDialog confirming={{ action, row: row('Second') }} onCancel={noop} onConfirm={noop} />
        </>,
      ),
    );

    const labels = Array.from(container.querySelectorAll('dialog')).map(
      (dialog) => document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(labels).toEqual(['Delete First?', 'Delete Second?']);
  });
});
