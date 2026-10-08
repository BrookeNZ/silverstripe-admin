/**
 * Per-block flags (expanded, mounted, dirty, saving) held as sets of block ids in React state.
 */
import type * as React from 'react';

export type IdSetter = React.Dispatch<React.SetStateAction<ReadonlySet<number>>>;

/** Adds or removes the id, keeping the same set when nothing changes so React skips the render */
export const setIn = (setter: IdSetter, id: number, on: boolean): void =>
  setter((current) => {
    if (current.has(id) === on) {
      return current;
    }
    const next = new Set(current);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  });
