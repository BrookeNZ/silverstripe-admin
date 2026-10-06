import { describe, expect, it } from 'vitest';
import { describePoint, focusFromClick, markerPercent, nudge, pickerSize } from './focusPoint';

describe('focus point maths', () => {
  it('shows the preview at half size, rounding up', () => {
    expect(pickerSize(435, 300)).toEqual({ width: 218, height: 150 });
  });

  it('maps a click to -1..1 from the top left', () => {
    expect(focusFromClick(0, 0, 218, 150)).toEqual({ focusX: -1, focusY: -1 });
    expect(focusFromClick(109, 75, 218, 150)).toEqual({ focusX: 0, focusY: 0 });
    expect(focusFromClick(218, 150, 218, 150)).toEqual({ focusX: 1, focusY: 1 });
    expect(focusFromClick(54.5, 112.5, 218, 150)).toEqual({ focusX: -0.5, focusY: 0.5 });
  });

  it('places the marker on the clicked point as a percentage of the box', () => {
    expect(markerPercent(0, 0)).toEqual({ left: 50, top: 50 });
    expect(markerPercent(-1, 1)).toEqual({ left: 0, top: 100 });
    const point = focusFromClick(160, 40, 218, 150);
    const { left, top } = markerPercent(point.focusX, point.focusY);
    expect((left / 100) * 218).toBeCloseTo(160);
    expect((top / 100) * 150).toBeCloseTo(40);
  });

  it('lands on the same point when the box renders at another size', () => {
    // A click at the same relative spot of a box scaled by 1.25 gives the same point and percentage
    const small = focusFromClick(160, 40, 218, 150);
    const large = focusFromClick(200, 50, 272.5, 187.5);
    expect(large.focusX).toBeCloseTo(small.focusX);
    expect(large.focusY).toBeCloseTo(small.focusY);
    expect(markerPercent(large.focusX, large.focusY).left).toBeCloseTo(markerPercent(small.focusX, small.focusY).left);
  });

  it('nudges by a tenth with the arrow keys, up being negative Y, within -1..1', () => {
    expect(nudge({ focusX: 0, focusY: 0 }, 'ArrowRight')).toEqual({ focusX: 0.1, focusY: 0 });
    expect(nudge({ focusX: 0, focusY: 0 }, 'ArrowUp')).toEqual({ focusX: 0, focusY: -0.1 });
    expect(nudge({ focusX: 0.2, focusY: 0.3 }, 'ArrowLeft')).toEqual({ focusX: 0.1, focusY: 0.3 });
    expect(nudge({ focusX: 0.95, focusY: 1 }, 'ArrowRight')).toEqual({ focusX: 1, focusY: 1 });
    expect(nudge({ focusX: 0.95, focusY: 1 }, 'ArrowDown')).toEqual({ focusX: 0.95, focusY: 1 });
    expect(nudge({ focusX: 0, focusY: 0 }, 'Enter')).toBeNull();
  });

  it('describes the point for assistive technology', () => {
    expect(describePoint({ focusX: 0.1, focusY: -0.25 })).toBe('X 0.10, Y -0.25');
  });
});
