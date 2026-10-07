/**
 * A button that opens a panel anchored to it: `Popover` for a group of secondary fields, `Menu` for a list
 * of actions (the design's "..." options button). The panel closes on Escape and on a pointer press
 * outside, returning focus to the button; a group also closes when focus leaves it. It stays mounted
 * while closed, so fields inside keep their state.
 *
 * The panel opens in the top layer through useAnchoredLayer, so no row, scrolling body or dialog clips
 * it. `align` lines its start or end edge up with the button's (end suits a trailing "..." button), and
 * `placement` opens it below or above, flipping when only the other side has room. A menu follows the APG menu button pattern:
 * opening focuses the first item, arrows, Home and End move between items, Tab leaves and closes, and
 * the buttons inside become its `menuitem`s through MenuItemContext.
 */
import * as React from 'react';
import { Button } from './Button';
import { MoreOptionsIcon } from './icons';
import { useAnchoredLayer } from './anchoredLayer';
import type { AnchorAlign, AnchorPlacement } from './anchoredLayer';
import { MenuItemContext } from './menuContext';

export type PopoverAlign = AnchorAlign;
export type PopoverPlacement = AnchorPlacement;

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

// React 18's types do not know the popover attribute yet
const topLayer = { popover: 'manual' } as React.HTMLAttributes<HTMLDivElement>;

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

  const side = useAnchoredLayer(open, button, panel, align, placement);

  React.useLayoutEffect(() => {
    if (open && isMenu) {
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
        className="admin-popover__panel"
        id={panelId}
        {...topLayer}
        data-align={align}
        data-placement={side}
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
