/**
 * The shell's one polite live region. It is rendered empty with the layout, so assistive technology
 * is already watching it when the first message arrives: route changes announce the new page's title
 * and notifications announce their text. A repeated message is cleared first so it is read again.
 */
import * as React from 'react';

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/** Long enough for a screen reader to notice the cleared region before the new text lands */
export const announceDelay = 100;

export function announce(message: string): void {
  listeners.forEach((listener) => listener(message));
}

export const LiveAnnouncer = () => {
  const [message, setMessage] = React.useState('');
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener: Listener = (next) => {
      clearTimeout(timer);
      setMessage('');
      timer = setTimeout(() => setMessage(next), announceDelay);
    };
    listeners.add(listener);
    return () => {
      clearTimeout(timer);
      listeners.delete(listener);
    };
  }, []);
  return (
    <div className="shell__announcer" role="status">
      {message}
    </div>
  );
};
