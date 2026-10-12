import * as React from 'react';

export type UnsavedChangesLevel = 'none' | 'unsaved' | 'notice' | 'warning';

export interface UnsavedChangesMinutes {
  notice?: number | null;
  warning?: number | null;
}

const minute = 60000;

/** How loudly to flag changes that have been unsaved for `elapsedMs` */
export function unsavedChangesLevel(dirty: boolean, elapsedMs: number, minutes: UnsavedChangesMinutes = {}): UnsavedChangesLevel {
  if (!dirty) {
    return 'none';
  }
  if (minutes.warning && elapsedMs >= minutes.warning * minute) {
    return 'warning';
  }
  if (minutes.notice && elapsedMs >= minutes.notice * minute) {
    return 'notice';
  }
  return 'unsaved';
}

export interface UnsavedChangesIndicatorProps {
  id?: string;
  dirty: boolean;
  minutes?: UnsavedChangesMinutes;
}

/**
 * A status line for unsaved changes: shown as soon as something is changed, then with the elapsed
 * minutes once the notice and warning thresholds pass. The live region stays mounted so screen
 * readers announce each change of level
 */
export const UnsavedChangesIndicator = ({ id, dirty, minutes }: UnsavedChangesIndicatorProps) => {
  const [elapsed, setElapsed] = React.useState(0);
  const [wasDirty, setWasDirty] = React.useState(dirty);
  if (dirty !== wasDirty) {
    setWasDirty(dirty);
    setElapsed(0);
  }

  React.useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(tick);
  }, [dirty]);

  const level = unsavedChangesLevel(dirty, elapsed, minutes);
  const elapsedMinutes = Math.floor(elapsed / minute);

  return (
    <p className={`admin-unsaved admin-unsaved--${level}`} id={id} role="status">
      {level === 'unsaved' && 'Unsaved changes'}
      {(level === 'notice' || level === 'warning') && `Unsaved changes: ${elapsedMinutes} mins`}
    </p>
  );
};
