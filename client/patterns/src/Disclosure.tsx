/**
 * A titled panel that shows and hides its content: a heading holding a button that toggles the panel
 * below it (the WAI-ARIA disclosure pattern). Each disclosure is independent; there is no accordion
 * group that closes its siblings.
 *
 * Open state is uncontrolled (`defaultOpen`) or controlled (`open` with `onToggle`). A closed panel
 * stays mounted with `hidden`, so fields inside keep their values and registrations, and it opens
 * itself when a field inside it is revealed (reveal.ts), as a tab panel does.
 */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { CollapsedIcon, ExpandedIcon } from './icons';
import { revealFieldEvent } from './reveal';

export interface DisclosureProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'onToggle'> {
  title: React.ReactNode;
  /** The heading element's level, 1 to 6 */
  headingLevel?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** Defaults to an id derived from the root's `id`, else a generated one */
  panelId?: string;
  children?: React.ReactNode;
}

export const Disclosure = ({
  title,
  headingLevel = 3,
  open,
  defaultOpen = false,
  onToggle,
  panelId,
  id,
  className,
  children,
  ...rest
}: DisclosureProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const generatedId = React.useId();
  const panel = panelId ?? `${id ?? generatedId}_panel`;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const level = Math.min(Math.max(Math.round(headingLevel) || 3, 1), 6);
  const Heading = `h${level}` as 'h3';
  const Caret = isOpen ? ExpandedIcon : CollapsedIcon;

  const setOpen = (next: boolean) => {
    if (open === undefined) {
      setUncontrolledOpen(next);
    }
    onToggle?.(next);
  };

  const latest = React.useRef({ open, onToggle });
  React.useEffect(() => {
    latest.current = { open, onToggle };
  });

  React.useEffect(() => {
    const element = panelRef.current;
    const reveal = () => {
      if (!element?.hidden) {
        return;
      }
      flushSync(() => {
        if (latest.current.open === undefined) {
          setUncontrolledOpen(true);
        }
        latest.current.onToggle?.(true);
      });
    };
    element?.addEventListener(revealFieldEvent, reveal);
    return () => element?.removeEventListener(revealFieldEvent, reveal);
  }, []);

  const classes = ['admin-disclosure', isOpen && 'admin-disclosure--open', className].filter(Boolean).join(' ');

  return (
    <div className={classes} id={id} {...rest}>
      <Heading className="admin-disclosure__heading">
        <button
          type="button"
          className="admin-disclosure__button"
          aria-expanded={isOpen}
          aria-controls={panel}
          onClick={() => setOpen(!isOpen)}
        >
          <Caret className="admin-disclosure__icon" />
          {title}
        </button>
      </Heading>
      <div className="admin-disclosure__panel" id={panel} ref={panelRef} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
};
