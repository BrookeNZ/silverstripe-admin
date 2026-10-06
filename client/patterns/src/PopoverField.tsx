import * as React from 'react';
import { fieldTitle } from './FieldHolder';
import type { FieldProps } from './types';

/**
 * A disclosure button that shows its child fields in a panel beside it, for secondary actions. The
 * panel closes on Escape (focus returns to the button), on a pointer press outside it and when focus
 * leaves it; its fields stay mounted while it is closed
 */
export const PopoverField = ({ field, renderFields }: FieldProps) => {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const panelId = `${field.id}_Popover`;
  const label = fieldTitle(field) || field.buttonLabel || 'More actions';

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
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
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

  return (
    <div className="admin-popover" id={field.holderId} ref={root} onKeyDown={onKeyDown} onBlur={onBlur} onPointerDown={onPointerDown}>
      <button
        ref={button}
        className="admin-button"
        type="button"
        id={field.id}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={field.disabled}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div
        className={field.placement === 'top' ? 'admin-popover__panel admin-popover__panel--top' : 'admin-popover__panel'}
        id={panelId}
        role="group"
        aria-label={field.panelTitle || label}
        hidden={!open}
      >
        {field.panelTitle && <p className="admin-popover__title">{field.panelTitle}</p>}
        {renderFields(field.children)}
      </div>
    </div>
  );
};
