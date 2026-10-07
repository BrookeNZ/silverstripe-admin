/**
 * Shows a panel anchored to a control in the browser's top layer (the `popover="manual"` attribute), so
 * it escapes every ancestor's overflow, stacking context and an open modal <dialog>, which a positioned
 * panel could not. The panel is `position: fixed` and reads its place from `--admin-anchor-top`,
 * `--admin-anchor-left` and `--admin-anchor-width`, measured from the anchor while open and again on any
 * scroll or resize, so it follows the control. Where the popover API is missing the same fixed panel
 * stacks on the popover layer token instead.
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
  viewportHeight: number,
  align: AnchorAlign,
  placement: AnchorPlacement,
): { top: number; left: number; placement: AnchorPlacement } {
  const needed = layer.height + gap;
  const roomBelow = viewportHeight - anchor.bottom;
  const roomAbove = anchor.top;
  let side = placement;
  if (side === 'bottom' && roomBelow < needed && roomAbove >= needed) {
    side = 'top';
  } else if (side === 'top' && roomAbove < needed && roomBelow >= needed) {
    side = 'bottom';
  }
  return {
    top: side === 'bottom' ? anchor.bottom : anchor.top - layer.height - 2 * gap,
    left: align === 'end' ? anchor.right - layer.width : anchor.left,
    placement: side,
  };
}

export function useAnchoredLayer(
  open: boolean,
  anchor: React.RefObject<HTMLElement>,
  layer: React.RefObject<HTMLElement>,
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
      const placed = placeLayer(anchorRect, rect, gap, window.innerHeight, align, placement);
      element.style.setProperty('--admin-anchor-top', `${placed.top}px`);
      element.style.setProperty('--admin-anchor-left', `${placed.left}px`);
      element.style.setProperty('--admin-anchor-width', `${anchorRect.width}px`);
      setSide(placed.placement);
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      if (typeof element.hidePopover === 'function' && isShown(element)) {
        element.hidePopover();
      }
    };
  }, [open, align, placement]);

  return side;
}
