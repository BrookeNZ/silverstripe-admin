/**
 * Shows a panel anchored to a control in the browser's top layer (the `popover="manual"` attribute), so
 * it escapes every ancestor's overflow, stacking context and an open modal <dialog>, which a positioned
 * panel could not. The panel is `position: fixed` and reads its place from `--admin-anchor-top`,
 * `--admin-anchor-left` and `--admin-anchor-width`, measured from the anchor while open and again on any
 * scroll, window resize or change in the size of the panel or the anchor (a list filtering, a menu item
 * appearing, a field wrapping), so it follows the control. It is kept inside the viewport horizontally.
 * Where the popover API is missing the same fixed panel stacks on `--admin-z-popover-fallback` instead.
 *
 * `align` lines the panel's start or end edge up with the anchor's; `placement` opens it below or
 * above, flipping when that side has no room and the other has. Closing, focus and outside clicks stay
 * with the component that owns the panel.
 */
import * as React from 'react';

export type AnchorAlign = 'start' | 'end';
export type AnchorPlacement = 'top' | 'bottom';

function isShown(element: HTMLElement): boolean {
  try {
    return element.matches(':popover-open');
  } catch {
    return false;
  }
}

export function placeLayer(
  anchor: DOMRect,
  layer: { width: number; height: number },
  gap: number,
  viewport: { width: number; height: number },
  align: AnchorAlign,
  placement: AnchorPlacement,
): { top: number; left: number; placement: AnchorPlacement } {
  const needed = layer.height + gap;
  const roomBelow = viewport.height - anchor.bottom;
  const roomAbove = anchor.top;
  let side = placement;
  if (side === 'bottom' && roomBelow < needed && roomAbove >= needed) {
    side = 'top';
  } else if (side === 'top' && roomAbove < needed && roomBelow >= needed) {
    side = 'bottom';
  }
  const left = align === 'end' ? anchor.right - layer.width : anchor.left;
  return {
    top: side === 'bottom' ? anchor.bottom : anchor.top - layer.height - 2 * gap,
    left: Math.max(0, Math.min(left, viewport.width - layer.width)),
    placement: side,
  };
}

export function useAnchoredLayer(
  open: boolean,
  anchor: React.RefObject<HTMLElement | null>,
  layer: React.RefObject<HTMLElement | null>,
  align: AnchorAlign,
  placement: AnchorPlacement,
): AnchorPlacement {
  const [side, setSide] = React.useState(placement);

  React.useLayoutEffect(() => {
    const element = layer.current;
    if (!open || !element) {
      return undefined;
    }
    if (typeof element.showPopover === 'function' && !isShown(element)) {
      element.showPopover();
    }
    const place = () => {
      const anchorRect = anchor.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }
      const rect = element.getBoundingClientRect();
      // The margin is the gap the stylesheet puts between control and panel
      const gap = parseFloat(getComputedStyle(element).marginTop) || 0;
      // clientWidth leaves out a vertical scrollbar, which the panel must not sit under
      const viewport = { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
      const placed = placeLayer(anchorRect, rect, gap, viewport, align, placement);
      element.style.setProperty('--admin-anchor-top', `${placed.top}px`);
      element.style.setProperty('--admin-anchor-left', `${placed.left}px`);
      element.style.setProperty('--admin-anchor-width', `${anchorRect.width}px`);
      setSide(placed.placement);
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    resized?.observe(element);
    if (anchor.current) {
      resized?.observe(anchor.current);
    }
    return () => {
      resized?.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      if (typeof element.hidePopover === 'function' && isShown(element)) {
        element.hidePopover();
      }
    };
  }, [open, align, placement]);

  return side;
}
