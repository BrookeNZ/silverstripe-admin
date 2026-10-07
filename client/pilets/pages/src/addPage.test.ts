import { describe, expect, it, vi } from 'vitest';
import { addPage } from './addPage';
import { createPageApi } from './api';

describe('addPage', () => {
  it('posts the type and parent with the token, re-reads the parent, then lands on the new page', async () => {
    const steps: Array<string> = [];
    const fetcher = vi.fn(async () => {
      steps.push('post');
      return new Response(JSON.stringify({ id: 42, parentId: 7, className: 'Page', title: 'New Page' }), { status: 201 });
    });
    const client = createPageApi('https://cms.test/admin/pages/create/', () => 'token-1', fetcher as unknown as typeof fetch);
    const store = { childAdded: vi.fn(async () => { steps.push('tree'); }) };
    const land = vi.fn(() => steps.push('land'));

    await addPage({ client, store, land }, 7, 'Page');

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cms.test/admin/pages/create/page');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-SecurityID']).toBe('token-1');
    expect(JSON.parse(String(init.body))).toEqual({ parentId: 7, className: 'Page' });
    expect(store.childAdded).toHaveBeenCalledWith(7);
    expect(land).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
    expect(steps).toEqual(['post', 'tree', 'land']);
  });

  it('does not land when the server refuses', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ errors: [{ value: 'This page type cannot be created here', reason: 'forbidden' }] }),
      { status: 403 },
    ));
    const client = createPageApi('https://cms.test/admin/pages/create/', () => 'token-1', fetcher as unknown as typeof fetch);
    const land = vi.fn();

    await expect(addPage({ client, store: { childAdded: vi.fn() }, land }, 7, 'Page')).rejects.toThrow('cannot be created here');
    expect(land).not.toHaveBeenCalled();
  });
});
