/**
 * Whether a media query matches, kept current as the viewport changes. Reads false on the server and
 * wherever matchMedia is missing, so markup drawn without a viewport takes the narrow layout.
 */
import * as React from 'react';

const serverSnapshot = (): boolean => false;

export const useMediaQuery = (query: string): boolean => {
  const subscribe = React.useCallback(
    (listener: () => void): (() => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', listener);
      return () => list?.removeEventListener('change', listener);
    },
    [query],
  );
  const snapshot = React.useCallback((): boolean => window.matchMedia?.(query).matches ?? false, [query]);
  return React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
};
