import type { PiletMetadata } from 'piral-core';

/**
 * The pilet list for Piral's `requestPilets`. The shell page inlines the feed as `data-pilets`
 * (LeftAndMain::PiralPilets), so the first call answers from it without a round trip; a page without it,
 * or with one that does not parse, and every later call read `feedUrl` (admin/pilets/, which `piral debug`
 * and `pilet debug` also merge their pilets into)
 */
export function createRequestPilets(
  root: HTMLElement,
  feedUrl: string,
  fetcher: typeof fetch = fetch,
): () => Promise<Array<PiletMetadata>> {
  let inlined = readInlinedPilets(root);
  return () => {
    if (inlined) {
      const items = inlined;
      inlined = null;
      return Promise.resolve(items);
    }
    return fetchFeed(feedUrl, fetcher);
  };
}

function readInlinedPilets(root: HTMLElement): Array<PiletMetadata> | null {
  const json = root.dataset.pilets;
  if (!json) {
    return null;
  }
  try {
    const items: unknown = JSON.parse(json);
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

function fetchFeed(feedUrl: string, fetcher: typeof fetch): Promise<Array<PiletMetadata>> {
  return fetcher(feedUrl, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  }).then((res) => {
    if (res.redirected || !res.ok) {
      throw new Error(`The pilet feed answered ${res.status} from ${res.url}`);
    }
    return res.json().then((feed) => feed.items);
  });
}
