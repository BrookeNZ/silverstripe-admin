import { describe, expect, it, vi } from 'vitest';
import { addPage } from './addPage';
import { createPageApi } from './api';
import type { JsonRequest } from './api';

describe('addPage', () => {
  it('posts the type and parent, re-reads the parent, then lands on the new page', async () => {
    const steps: Array<string> = [];
    const fetchJson = vi.fn(async () => {
      steps.push('post');
      return { id: 42, parentId: 7, className: 'Page', title: 'New Page' };
    });
    const client = createPageApi('https://cms.test/admin/pages/create/', fetchJson as unknown as JsonRequest);
    const store = { childAdded: vi.fn(async () => { steps.push('tree'); }) };
    const land = vi.fn(() => steps.push('land'));

    await addPage({ client, store, land }, 7, 'Page');

    expect(fetchJson).toHaveBeenCalledWith('https://cms.test/admin/pages/create/page', {
      method: 'POST',
      body: { parentId: 7, className: 'Page' },
    });
    expect(store.childAdded).toHaveBeenCalledWith(7);
    expect(land).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
    expect(steps).toEqual(['post', 'tree', 'land']);
  });

  it('does not land when the server refuses', async () => {
    const fetchJson = vi.fn(async () => {
      throw Object.assign(new Error('This page type cannot be created here'), { status: 403, sessionExpired: false, reason: 'forbidden' });
    });
    const client = createPageApi('https://cms.test/admin/pages/create/', fetchJson as unknown as JsonRequest);
    const land = vi.fn();

    await expect(addPage({ client, store: { childAdded: vi.fn() }, land }, 7, 'Page')).rejects.toMatchObject({
      message: 'This page type cannot be created here',
      reason: 'forbidden',
    });
    expect(land).not.toHaveBeenCalled();
  });
});
