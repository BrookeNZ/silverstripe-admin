/**
 * Focus point maths, kept as jonom/focuspoint's FocusPointPicker does it: the picker shows the preview
 * at half its size, and a click maps to -1..1 on each axis from the top left (so -1, -1 is the top left
 * corner and 0, 0 the centre). The marker is placed in percentages of the image box rather than pixels,
 * so it lands on the clicked point whatever the root font size or rendered image size.
 */
export interface FocusPoint {
  focusX: number;
  focusY: number;
}

export function pickerSize(previewWidth: number, previewHeight: number): { width: number; height: number } {
  return { width: Math.ceil(previewWidth * 0.5), height: Math.ceil(previewHeight * 0.5) };
}

export function focusFromClick(offsetX: number, offsetY: number, width: number, height: number): FocusPoint {
  return {
    focusX: (offsetX * 2) / width - 1,
    focusY: (offsetY * 2) / height - 1,
  };
}

export function markerPercent(focusX: number, focusY: number): { left: number; top: number } {
  return {
    left: (clamp(focusX) + 1) * 50,
    top: (clamp(focusY) + 1) * 50,
  };
}

export const nudgeStep = 0.1;

const nudges: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The point after an arrow key press, or null for any other key */
export function nudge(point: FocusPoint, key: string, step = nudgeStep): FocusPoint | null {
  const direction = nudges[key];
  if (!direction) {
    return null;
  }
  return {
    focusX: round(clamp(point.focusX + direction[0] * step)),
    focusY: round(clamp(point.focusY + direction[1] * step)),
  };
}

export function describePoint({ focusX, focusY }: FocusPoint): string {
  return `X ${focusX.toFixed(2)}, Y ${focusY.toFixed(2)}`;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
