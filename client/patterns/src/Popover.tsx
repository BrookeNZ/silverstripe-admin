/**
 * A button that opens a panel anchored to it: `Popover` for a group of secondary fields, `Menu` for a list
 * of actions (the design's "..." options button). The panel closes on Escape and on a pointer press
 * outside, returning focus to the button; a group also closes when focus leaves it. It stays mounted
 * while closed, so fields inside keep their state.
 *
 * `align` lines the panel's start or end edge up with the button's (end suits a trailing "..." button),
 * and `placement` opens it below or above; a panel opening below that would run past the bottom of the
 * viewport opens above instead when there is room there. A menu follows the APG menu button pattern:
 * opening focuses the first item, arrows, Home and End move between items, Tab leaves and closes, and
 * the buttons inside become its `menuitem`s through MenuItemContext.
 */
import * as React from 'react';
import { Button } from './Button';
import { MoreOptionsIcon } from './icons';
import { MenuItemContext } from './menuContext';

export type PopoverAlign = 'start' | 'end';
export type PopoverPlacement = 'top' | 'bottom';

export interface PopoverProps {
  /** The button's id; the panel is `<id>_Popover` */
  id: string;
  /** The button's accessible name; hidden text when there is no `title` */
  label: string;
  /** Visible button text; without it the button is the icon-only "..." options button */
  title?: string;
  /** The panel's heading, shown at its top and naming it */
  panelTitle?: string;
  align?: PopoverAlign;
  placement?: PopoverPlacement;
  disabled?: boolean;
  /** The holder element's id, for a field */
  holderId?: string;
  children?: React.ReactNode;
}

interface PanelProps extends PopoverProps {
  role: 'group' | 'menu';
}

const itemSelector = '[role="menuitem"]';

function panelClassName(align: PopoverAlign, placement: PopoverPlacement): string {
  return ['admin-popover__panel', placement === 'top' && 'admin-popover__panel--top', align === 'end' && 'admin-popover__panel--end']
    .filter(Boolean)
    .join(' ');
}

const AnchoredPanel = ({
  id,
  label,
  title,
  panelTitle,
  align = 'end',
  placement = 'bottom',
  disabled,
  holderId,
  role,
  children,
}: PanelProps) => {
  const [open, setOpen] = React.useState(false);
  const [flipped, setFlipped] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const panelId = `${id}_Popover`;
  const isMenu = role === 'menu';

  const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      button.current?.focus();
    }
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      setFlipped(false);
      return;
    }
    const rect = panel.current?.getBoundingClientRect();
    const anchor = button.current?.getBoundingClientRect();
    if (placement === 'bottom' && rect && anchor && rect.bottom > window.innerHeight && anchor.top > rect.height) {
      setFlipped(true);
    }
    if (isMenu) {
      items()[0]?.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    if (!isMenu) {
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const list = items();
    const current = list.indexOf(document.activeElement as HTMLElement);
    const next: Record<string, number> = {
      ArrowDown: (current + 1) % list.length,
      ArrowUp: (current - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    };
    if (event.key in next && list.length > 0) {
      event.preventDefault();
      list[next[event.key]].focus();
    }
  };

  // A press on a non-focusable part of the panel also blurs with no related target, so it must not close
  const pressedInside = React.useRef(false);
  const onPointerDown = () => {
    pressedInside.current = true;
    setTimeout(() => {
      pressedInside.current = false;
    });
  };

  const onBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (open && (next ? !root.current?.contains(next) : !pressedInside.current)) {
      setOpen(false);
    }
  };

  const menuContext = React.useMemo(() => ({ close: () => close(true) }), [close]);
  const content = isMenu && open ? <MenuItemContext.Provider value={menuContext}>{children}</MenuItemContext.Provider> : children;

  return (
    <div className="admin-popover" id={holderId} ref={root} onKeyDown={onKeyDown} onBlur={onBlur} onPointerDown={onPointerDown}>
      <Button
        ref={button as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
        variant={title ? 'secondary' : 'tertiary'}
        id={id}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup={isMenu ? 'menu' : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        iconOnly={!title}
        icon={!title && <MoreOptionsIcon />}
      >
        {title || label}
      </Button>
      <div
        ref={panel}
        className={panelClassName(align, flipped ? 'top' : placement)}
        id={panelId}
        role={role}
        aria-label={panelTitle || label}
        hidden={!open}
      >
        {panelTitle && <p className="admin-popover__title">{panelTitle}</p>}
        {content}
      </div>
    </div>
  );
};

export const Popover = (props: PopoverProps) => <AnchoredPanel {...props} role="group" />;

export const Menu = (props: PopoverProps) => <AnchoredPanel {...props} role="menu" />;
