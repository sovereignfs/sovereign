'use client';

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** Minimum effective drag distance (px) before a direction is read at all —
 *  keeps a tap or a tiny jitter from registering as a swipe. Matches
 *  useSwipeReveal's own deadzone. */
const DEADZONE_PX = 8;

/** Horizontal drag distance (px) that reaches the full tilt cap. */
const ROTATION_RANGE_PX = 240;
const ROTATION_MAX_DEG = 12;

/** Duration (ms) of both the commit fling-out and the spring-back-under-
 *  threshold transition. Exported so SwipeStack can hold a just-committed
 *  card in place for exactly this long before advancing to the next one. */
export const SWIPE_STACK_TRANSITION_MS = 220;

const ALL_DIRECTIONS: readonly SwipeDirection[] = ['left', 'right', 'up', 'down'];

/** Unit vector per direction — reused for both the fling-out offset and the
 *  tilt sign (horizontal directions tilt, vertical ones don't: x is ±1/0). */
const UNIT_VECTOR: Record<SwipeDirection, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

export interface UseSwipeStackOptions {
  /** Directions this drag can move toward and resolve to. A direction left
   *  out of this list is a wall, not just an unreachable outcome — the card
   *  will not visually move that way at all (see clampToLiveDirections). */
  directions: readonly SwipeDirection[];
  /** Effective distance (px) a drag must cross before release commits to
   *  that direction instead of springing back. No velocity component — a
   *  fast short flick under this distance still springs back. */
  threshold?: number;
  /** Fires once, synchronously, when a drag (or triggerCommit) resolves to
   *  a live direction past threshold. This hook has already started the
   *  fling-out animation on cardRef's element by the time this is called —
   *  the caller only needs to react to the outcome, not drive the motion. */
  onCommit: (direction: SwipeDirection) => void;
  /** Disables both the drag and triggerCommit — e.g. while there is no
   *  current card to act on. */
  disabled?: boolean;
}

export interface UseSwipeStackHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}

export interface UseSwipeStackResult {
  /** Attach to the card element that should translate/rotate with the drag. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** Attach to the ancestor of both the card and any direction-stamp
   *  overlays. The hook writes live drag progress here as CSS custom
   *  properties (--sv-stack-progress-left/right/up/down, each 0–1) so
   *  stamps — siblings of the card, not the card itself — can react without
   *  a re-render per pointermove. */
  wrapRef: RefObject<HTMLDivElement | null>;
  handlers: UseSwipeStackHandlers;
  /** CSS touch-action for the card, derived from which directions are live
   *  — an axis with nothing configured on it stays native (pan-x/pan-y) so
   *  a page can still scroll through a stack that only uses the other axis;
   *  `none` only once both axes are actually needed. */
  touchAction: string;
  /** Programmatically commits a direction — the same fling animation and
   *  onCommit call a real drag past threshold would produce. Backs the
   *  non-gesture fallback buttons: they are not a separate code path, just
   *  a different way to call this. No-ops if the direction isn't live or
   *  the hook is disabled. */
  triggerCommit: (direction: SwipeDirection) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Zeroes out movement toward any direction not in `live` — the card
 *  behaves as if a wall exists there instead of just being an unreachable
 *  commit outcome, so e.g. a left/right-only stack never visually drifts
 *  vertically. */
function clampToLiveDirections(
  dx: number,
  dy: number,
  live: ReadonlySet<SwipeDirection>,
): [number, number] {
  const x = dx > 0 ? (live.has('right') ? dx : 0) : live.has('left') ? dx : 0;
  const y = dy > 0 ? (live.has('down') ? dy : 0) : live.has('up') ? dy : 0;
  return [x, y];
}

function resolveDirection(
  dx: number,
  dy: number,
  live: ReadonlySet<SwipeDirection>,
): SwipeDirection | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < DEADZONE_PX && absY < DEADZONE_PX) return null;
  const candidate: SwipeDirection =
    absX > absY ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return live.has(candidate) ? candidate : null;
}

/**
 * useSwipeStack — hand-rolled 4-directional free drag, extending
 * useSwipeReveal's pattern (raw Pointer Events, a deadzone, transform
 * written straight to a ref, resolved only on release) from one axis with
 * two outcomes to four directions with a tilt. Threshold-only on purpose,
 * matching useSwipeReveal — no velocity tracking, so a fast short flick
 * under `threshold` still springs back.
 */
export function useSwipeStack({
  directions,
  threshold = 96,
  onCommit,
  disabled = false,
}: UseSwipeStackOptions): UseSwipeStackResult {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number } | null>(null);
  const live = new Set(directions);

  function writeProgress(direction: SwipeDirection | null, progress: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    for (const d of ALL_DIRECTIONS) {
      wrap.style.setProperty(`--sv-stack-progress-${d}`, d === direction ? String(progress) : '0');
    }
  }

  function writeTransform(dx: number, dy: number) {
    const card = cardRef.current;
    if (!card) return;
    const rotation = clamp(
      (dx / ROTATION_RANGE_PX) * ROTATION_MAX_DEG,
      -ROTATION_MAX_DEG,
      ROTATION_MAX_DEG,
    );
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`;
  }

  function springBack() {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = `transform ${SWIPE_STACK_TRANSITION_MS}ms ease`;
    card.style.transform = '';
  }

  function flingOut(direction: SwipeDirection) {
    const card = cardRef.current;
    if (!card) return;
    const distance = 1.4 * Math.max(window.innerWidth, window.innerHeight);
    const [ux, uy] = UNIT_VECTOR[direction];
    card.style.transition = `transform ${SWIPE_STACK_TRANSITION_MS}ms ease`;
    card.style.transform = `translate(${ux * distance}px, ${uy * distance}px) rotate(${ux * ROTATION_MAX_DEG}deg)`;
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY };
    if (cardRef.current) cardRef.current.style.transition = '';
  }

  function onPointerMove(e: ReactPointerEvent) {
    const state = dragState.current;
    if (!state) return;
    const [dx, dy] = clampToLiveDirections(
      e.clientX - state.startX,
      e.clientY - state.startY,
      live,
    );
    writeTransform(dx, dy);
    const direction = resolveDirection(dx, dy, live);
    if (direction) e.preventDefault();
    writeProgress(
      direction,
      direction ? clamp(Math.max(Math.abs(dx), Math.abs(dy)) / threshold, 0, 1) : 0,
    );
  }

  function release(e: ReactPointerEvent) {
    const state = dragState.current;
    dragState.current = null;
    if (!state) return;
    const [dx, dy] = clampToLiveDirections(
      e.clientX - state.startX,
      e.clientY - state.startY,
      live,
    );
    const direction = resolveDirection(dx, dy, live);
    writeProgress(null, 0);
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (direction && distance >= threshold) {
      flingOut(direction);
      onCommit(direction);
    } else {
      springBack();
    }
  }

  function triggerCommit(direction: SwipeDirection) {
    if (disabled || !live.has(direction)) return;
    flingOut(direction);
    onCommit(direction);
  }

  const hasHorizontal = live.has('left') || live.has('right');
  const hasVertical = live.has('up') || live.has('down');
  const touchAction =
    hasHorizontal && hasVertical
      ? 'none'
      : hasHorizontal
        ? 'pan-y'
        : hasVertical
          ? 'pan-x'
          : 'auto';

  return {
    cardRef,
    wrapRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release },
    touchAction,
    triggerCommit,
  };
}
