/**
 * The arithmetic of the photo viewer's gestures, kept apart from the component so that it is exact and testable without a browser: how far a photo zooms, where it may be moved to, and what a
 * finished drag meant. Everything here is pure.
 */
export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** What a double tap zooms to. */
export const DOUBLE_TAP_SCALE = 2.5;
/** A drag past this fraction of the width turns the page. */
export const SWIPE_FRACTION = 0.2;
/** A quick flick turns the page past this speed (pixels a millisecond), however short. */
export const SWIPE_VELOCITY = 0.5;
/** A drag down past this many pixels, or this fast, closes the viewer. */
export const DISMISS_DISTANCE = 110;
export const DISMISS_VELOCITY = 0.6;
/** Two taps within this many milliseconds and pixels are a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 32;

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

export const clampScale = (scale: number): number => clamp(scale, MIN_SCALE, MAX_SCALE);

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The scale after a pinch that began at `startScale` with the fingers `startDistance` apart and now has them `nowDistance` apart. */
export function pinchScale(startScale: number, startDistance: number, nowDistance: number): number {
  if (startDistance <= 0) return clampScale(startScale);
  return clampScale((startScale * nowDistance) / startDistance);
}

/** How far a photo of `size` (as drawn, unzoomed) may be moved at `scale` inside a `box`: none while it fits, and never so far that an edge leaves the middle of the screen. */
export function panLimit(
  size: { width: number; height: number },
  box: { width: number; height: number },
  scale: number,
): Point {
  return {
    x: Math.max(0, (size.width * scale - box.width) / 2),
    y: Math.max(0, (size.height * scale - box.height) / 2),
  };
}

export function clampPan(
  pan: Point,
  size: { width: number; height: number },
  box: { width: number; height: number },
  scale: number,
): Point {
  const limit = panLimit(size, box, scale);
  return { x: clamp(pan.x, -limit.x, limit.x), y: clamp(pan.y, -limit.y, limit.y) };
}

/**
 * The pan that keeps the point under the fingers (or the pointer), given as an offset from the middle of the box, where it was when the scale changed from `from` to `to`: zooming around a point
 * and not around the middle.
 */
export function panAfterZoom(pan: Point, focus: Point, from: number, to: number): Point {
  const ratio = to / from;
  return { x: focus.x - (focus.x - pan.x) * ratio, y: focus.y - (focus.y - pan.y) * ratio };
}

export type DragResult =
  | { readonly kind: 'next' }
  | { readonly kind: 'previous' }
  | { readonly kind: 'dismiss' }
  | { readonly kind: 'stay' };

/**
 * What a drag on an unzoomed photo meant when the finger lifted: `dx`, `dy` is how far it went, `ms` how long it took. A mostly sideways drag turns the page (past a fifth of the width or at
 * speed), towards the next photo when it went left, but only if there is one that way; a mostly downward drag closes the viewer; anything else leaves it where it was.
 */
export function judgeDrag(input: {
  dx: number;
  dy: number;
  ms: number;
  width: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): DragResult {
  const { dx, dy, width, hasPrevious, hasNext } = input;
  const ms = Math.max(1, input.ms);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const quick = Math.abs(dx) / ms >= SWIPE_VELOCITY && Math.abs(dx) >= 24;
    if (Math.abs(dx) >= width * SWIPE_FRACTION || quick) {
      if (dx < 0 && hasNext) return { kind: 'next' };
      if (dx > 0 && hasPrevious) return { kind: 'previous' };
    }
    return { kind: 'stay' };
  }
  if (dy > 0 && (dy >= DISMISS_DISTANCE || (dy / ms >= DISMISS_VELOCITY && dy >= 40)))
    return { kind: 'dismiss' };
  return { kind: 'stay' };
}

/** Whether a tap at `now` is the second of a double tap, given the one before it. */
export function isDoubleTap(
  last: { at: number; point: Point } | undefined,
  now: { at: number; point: Point },
): boolean {
  return (
    last !== undefined &&
    now.at - last.at <= DOUBLE_TAP_MS &&
    distance(last.point, now.point) <= DOUBLE_TAP_PX
  );
}

/** The scale a double tap goes to: back to the whole photo if it is zoomed at all, in if it is not. */
export const doubleTapScale = (scale: number): number =>
  scale > MIN_SCALE + 0.01 ? MIN_SCALE : DOUBLE_TAP_SCALE;

/** The index after moving by `step`, kept inside the list. */
export const stepIndex = (index: number, step: number, count: number): number =>
  clamp(index + step, 0, Math.max(0, count - 1));
