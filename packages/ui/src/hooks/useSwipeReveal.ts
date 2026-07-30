'use client';

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export interface UseSwipeRevealOptions {
  /** Max reveal distance in px — the row translates by `-revealWidth` when open. */
  revealWidth: number;
  /** Whether the reveal is currently open. Controlled by the caller so a
   *  list of rows can coordinate "only one open at a time" — this hook has
   *  no open state of its own. */
  open: boolean;
  /** Called when a drag releases past the halfway point — the caller should
   *  set `open` to true. */
  onOpen: () => void;
  /** Called when a drag releases before the halfway point — the caller
   *  should set `open` to false. */
  onClose: () => void;
  /** Skip entirely (hooks can't be called conditionally). */
  disabled?: boolean;
}

export interface UseSwipeRevealHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}

export interface UseSwipeRevealResult {
  /** Attach to the swipeable row element — the hook writes a live transform
   *  to it directly during the drag (not via React state) so the row tracks
   *  the finger at 60fps with no re-render per pointermove. */
  rowRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the row's pointer event handlers. */
  handlers: UseSwipeRevealHandlers;
}

/**
 * useSwipeReveal — horizontal swipe-to-reveal (e.g. Done/Delete actions
 * behind a list row), extracted from `sovereign-tasks`'s `TaskItem`/
 * `ListSidebar`, which independently hand-rolled the identical gesture twice
 * with only `revealWidth` differing (RFC 0079, epic task 9.20).
 *
 * Axis-locks on the first 8px of movement (so a vertical scroll or the
 * carousel's own horizontal swipe-between-slides gesture isn't hijacked by a
 * diagonal drag) and only resolves to open/closed on release, past the
 * halfway point of `revealWidth`.
 */
export function useSwipeReveal({
  revealWidth,
  open,
  onOpen,
  onClose,
  disabled = false,
}: UseSwipeRevealOptions): UseSwipeRevealResult {
  const rowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    locked: 'horizontal' | 'vertical' | null;
  } | null>(null);

  function onPointerDown(e: ReactPointerEvent) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, locked: null };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const state = dragState.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.locked = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (state.locked !== 'horizontal') return;
    e.preventDefault();
    const base = open ? -revealWidth : 0;
    const next = Math.min(0, Math.max(-revealWidth, base + dx));
    if (rowRef.current) rowRef.current.style.transform = `translateX(${next}px)`;
  }

  function releaseDrag(e: ReactPointerEvent) {
    const state = dragState.current;
    dragState.current = null;
    if (!state || state.locked !== 'horizontal') return;
    const dx = e.clientX - state.startX;
    const base = open ? -revealWidth : 0;
    const finalX = Math.min(0, Math.max(-revealWidth, base + dx));
    if (rowRef.current) rowRef.current.style.transform = '';
    if (finalX < -revealWidth / 2) onOpen();
    else onClose();
  }

  return {
    rowRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: releaseDrag,
      onPointerCancel: releaseDrag,
    },
  };
}
