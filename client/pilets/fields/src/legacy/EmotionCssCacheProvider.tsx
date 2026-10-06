import React from 'react';
import createCache from '@emotion/cache';
import type { EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

let reactSelectCache: EmotionCache | undefined;

/**
 * This ensures that Emotion's styles are inserted before ours so we can override
 * the default react-select styling
 */
function EmotionCssCacheProvider({ children }: { children: React.ReactNode }) {
  if (!reactSelectCache) {
    reactSelectCache = createCache({
      key: 'react-select',
      insertionPoint: document.querySelector('title') ?? undefined,
    });
  }

  return <CacheProvider value={reactSelectCache}>{children}</CacheProvider>;
}

export default EmotionCssCacheProvider;
