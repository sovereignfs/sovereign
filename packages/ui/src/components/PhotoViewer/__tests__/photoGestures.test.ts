import { describe, expect, it } from 'vitest';
import {
  DISMISS_DISTANCE,
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  clampScale,
  doubleTapScale,
  isDoubleTap,
  judgeDrag,
  panAfterZoom,
  panLimit,
  pinchScale,
  stepIndex,
} from '../photoGestures';

const BOX = { width: 400, height: 800 };
const base = { ms: 200, width: 400, hasPrevious: true, hasNext: true };

describe('zoom', () => {
  it('keeps the scale between whole and five times', () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it('follows the fingers: twice as far apart is twice the scale', () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 50)).toBe(1);
    expect(pinchScale(3, 100, 1000)).toBe(MAX_SCALE);
    expect(pinchScale(2, 0, 50)).toBe(2);
  });

  it('a double tap zooms in from whole, and out from zoomed', () => {
    expect(doubleTapScale(1)).toBe(DOUBLE_TAP_SCALE);
    expect(doubleTapScale(2)).toBe(1);
    expect(doubleTapScale(1.005)).toBe(DOUBLE_TAP_SCALE);
  });

  it('zooms around the point under the fingers, which stays where it was', () => {
    const focus = { x: 100, y: -50 };
    const pan = panAfterZoom({ x: 0, y: 0 }, focus, 1, 2);
    // The point of the photo that was under the focus is at (focus - pan) / scale, and is the same before and after.
    expect((focus.x - pan.x) / 2).toBeCloseTo((focus.x - 0) / 1);
    expect((focus.y - pan.y) / 2).toBeCloseTo((focus.y - 0) / 1);
  });
});

describe('where a zoomed photo may be moved', () => {
  const size = { width: 400, height: 300 };
  it('nowhere while it fits, and to its edges once it is bigger than the screen', () => {
    expect(panLimit(size, BOX, 1)).toEqual({ x: 0, y: 0 });
    expect(panLimit(size, BOX, 3)).toEqual({ x: 400, y: 50 });
  });

  it('is held inside the limit', () => {
    expect(clampPan({ x: 900, y: -900 }, size, BOX, 3)).toEqual({ x: 400, y: -50 });
    expect(clampPan({ x: 10, y: 10 }, size, BOX, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe('what a drag meant', () => {
  it('turns the page for a sideways drag of a fifth of the width, towards the way it went', () => {
    expect(judgeDrag({ ...base, dx: -90, dy: 5 })).toEqual({ kind: 'next' });
    expect(judgeDrag({ ...base, dx: 90, dy: -5 })).toEqual({ kind: 'previous' });
    expect(judgeDrag({ ...base, dx: -60, dy: 0 })).toEqual({ kind: 'stay' });
  });

  it('turns the page for a short, quick flick', () => {
    expect(judgeDrag({ ...base, dx: -50, dy: 0, ms: 60 })).toEqual({ kind: 'next' });
    expect(judgeDrag({ ...base, dx: -10, dy: 0, ms: 5 })).toEqual({ kind: 'stay' });
  });

  it('stays where it is at either end', () => {
    expect(judgeDrag({ ...base, dx: -200, dy: 0, hasNext: false })).toEqual({ kind: 'stay' });
    expect(judgeDrag({ ...base, dx: 200, dy: 0, hasPrevious: false })).toEqual({ kind: 'stay' });
  });

  it('closes for a drag down, far or fast, and not for one up or short', () => {
    expect(judgeDrag({ ...base, dx: 0, dy: DISMISS_DISTANCE })).toEqual({ kind: 'dismiss' });
    expect(judgeDrag({ ...base, dx: 4, dy: 60, ms: 70 })).toEqual({ kind: 'dismiss' });
    expect(judgeDrag({ ...base, dx: 0, dy: -300 })).toEqual({ kind: 'stay' });
    expect(judgeDrag({ ...base, dx: 0, dy: 50 })).toEqual({ kind: 'stay' });
  });

  it('judges a diagonal drag by the bigger way', () => {
    expect(judgeDrag({ ...base, dx: -100, dy: 60 })).toEqual({ kind: 'next' });
    expect(judgeDrag({ ...base, dx: 20, dy: 200 })).toEqual({ kind: 'dismiss' });
  });
});

describe('double taps and steps', () => {
  it('two taps close in time and place are a double tap, and others are not', () => {
    const first = { at: 1000, point: { x: 10, y: 10 } };
    expect(isDoubleTap(first, { at: 1200, point: { x: 14, y: 12 } })).toBe(true);
    expect(isDoubleTap(first, { at: 1400, point: { x: 10, y: 10 } })).toBe(false);
    expect(isDoubleTap(first, { at: 1100, point: { x: 200, y: 10 } })).toBe(false);
    expect(isDoubleTap(undefined, first)).toBe(false);
  });

  it('keeps the index inside the list', () => {
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
