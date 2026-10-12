// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createRequestPilets } from './feed';

const pilet = { name: 'pages', version: '1.0.0', link: 'https://example.com/pages/index.js', spec: 'v2' };
const feedUrl = 'https://example.com/admin/pilets/';

function shellRoot(pilets?: string): HTMLElement {
  const root = document.createElement('div');
  if (pilets !== undefined) {
    root.dataset.pilets = pilets;
  }
  return root;
}

function feedFetcher(items: Array<unknown>) {
  return vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 }));
}

describe('createRequestPilets', () => {
  it('answers the first call from the inlined list without fetching', async () => {
    const fetcher = feedFetcher([]);
    const requestPilets = createRequestPilets(shellRoot(JSON.stringify([pilet])), feedUrl, fetcher);

    await expect(requestPilets()).resolves.toEqual([pilet]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads the feed URL on a later call, so a refresh sees the current list', async () => {
    const fetcher = feedFetcher([pilet, { ...pilet, name: 'hello' }]);
    const requestPilets = createRequestPilets(shellRoot(JSON.stringify([pilet])), feedUrl, fetcher);

    await requestPilets();
    await expect(requestPilets()).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unparsable', '[{"name":'],
    ['not a list', '{"items":[]}'],
  ])('falls back to the feed URL when the inlined list is %s', async (_, pilets) => {
    const fetcher = feedFetcher([pilet]);
    const requestPilets = createRequestPilets(shellRoot(pilets), feedUrl, fetcher);

    await expect(requestPilets()).resolves.toEqual([pilet]);
    expect(fetcher).toHaveBeenCalledWith(feedUrl, expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('keeps an empty inlined list, which means the member has no pilets', async () => {
    const fetcher = feedFetcher([pilet]);

    await expect(createRequestPilets(shellRoot('[]'), feedUrl, fetcher)()).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects when the feed fails, so the shell shows its error page', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 500 }));

    await expect(createRequestPilets(shellRoot(), feedUrl, fetcher)()).rejects.toThrow('The pilet feed answered 500');
  });
});
