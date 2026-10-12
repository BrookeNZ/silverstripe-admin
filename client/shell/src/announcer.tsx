/**
 * The shell's live regions, one polite (`role="status"`) and one assertive (`role="alert"`). They are
 * rendered empty with the layout, so assistive technology is already watching them when the first
 * message arrives: route changes announce the new page's title politely, and notifications announce
 * their text, an error assertively as legacy's toasts did. A repeated message is cleared first so it is
 * read again. Messages that arrive together are queued, each shown for `announceDelay` before the next,
 * so a second toast does not replace the first before it is read.
 */
import * as React from 'react';

export type Politeness = 'polite' | 'assertive';

type Listener = (message: string, politeness: Politeness) => void;

const listeners = new Set<Listener>();

/** Long enough for a screen reader to notice the cleared region before the new text lands */
export const announceDelay = 100;

export function announce(message: string, politeness: Politeness = 'polite'): void {
  listeners.forEach((listener) => listener(message, politeness));
}

const useRegion = (politeness: Politeness) => {
  const [message, setMessage] = React.useState('');
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queue: Array<string> = [];
    const showNext = () => {
      const next = queue.shift();
      if (next === undefined) {
        timer = undefined;
        return;
      }
      setMessage('');
      timer = setTimeout(() => {
        setMessage(next);
        timer = setTimeout(showNext, announceDelay);
      }, announceDelay);
    };
    const listener: Listener = (next, nextPoliteness) => {
      if (nextPoliteness !== politeness) {
        return;
      }
      queue.push(next);
      if (timer === undefined) {
        showNext();
      }
    };
    listeners.add(listener);
    return () => {
      clearTimeout(timer);
      listeners.delete(listener);
    };
  }, [politeness]);
  return message;
};

export const LiveAnnouncer = () => {
  const polite = useRegion('polite');
  const assertive = useRegion('assertive');
  return (
    <>
      <div className="admin-visually-hidden" role="status">
        {polite}
      </div>
      <div className="admin-visually-hidden" role="alert">
        {assertive}
      </div>
    </>
  );
};
