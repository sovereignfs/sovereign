'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import {
  OVERLAY_MOTION_DURATION_MS,
  useOverlayFocusCapture,
  useOverlayKeyboardTrap,
  useOverlayPortalTarget,
  useOverlayScrollLock,
} from '../../overlay-shell';
import { Icon } from '../Icon/Icon';
import {
  MIN_SCALE,
  type Point,
  clamp,
  clampPan,
  clampScale,
  distance,
  doubleTapScale,
  isDoubleTap,
  judgeDrag,
  midpoint,
  panAfterZoom,
  pinchScale,
  stepIndex,
} from './photoGestures';
import styles from './PhotoViewer.module.css';

export interface Photo {
  /** Stable, for the list's keys. */
  id: string;
  /** The picture, from an address the app gives: an `https:` or `blob:` URL, or a path of the app's own. Nothing else is ever requested. */
  src: string;
  /** A smaller picture for the grid; `src` when absent. */
  thumbSrc?: string;
  /** What the picture shows, for someone who cannot see it. */
  alt: string;
  /** Shown beneath the picture in the viewer: a place and a date, a note, an author. */
  caption?: ReactNode;
}

export interface PhotoViewerProps {
  photos: readonly Photo[];
  /** Whether the viewer is showing. */
  open: boolean;
  /** Which photo is showing. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Names the viewer for assistive technology. Default "Photos". */
  label?: string;
}

const TAP_SLOP_PX = 8;

interface Pointer {
  x: number;
  y: number;
}

/**
 * A full-screen photo viewer (a design-system part, so every app's photos behave alike): swipe or the arrow keys between photos, pinch, double tap, a trackpad's pinch or the wheel to zoom, drag a
 * zoomed photo around, close with `Esc`, the close button or a swipe down. It is a dialog (`aria-modal`), traps focus, locks the page's scroll, **returns focus to what opened it**, and says
 * "3 of 12" to assistive technology as it moves. It shows the **caption slot** beneath the picture.
 *
 * It requests only the `src` addresses it is given, from the browser's own `<img>`: it adds no origin, no library and no font, so an app's CSP (`img-src`) is all it needs, and a `blob:` URL (a photo
 * not yet uploaded) works as any other. Neighbouring photos are fetched ahead from the same addresses.
 */
export function PhotoViewer({
  photos,
  open,
  index,
  onIndexChange,
  onClose,
  label = 'Photos',
}: PhotoViewerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(
    open,
    reducedMotion ? 0 : OVERLAY_MOTION_DURATION_MS,
  );
  const portalTarget = useOverlayPortalTarget();
  useOverlayScrollLock(mounted);
  useOverlayFocusCapture(panelRef, mounted && portalTarget !== null);
  useOverlayKeyboardTrap(panelRef, open, onClose);

  const count = photos.length;
  const current = clamp(index, 0, Math.max(0, count - 1));
  const photo = photos[current];

  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);

  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<{
    startScale: number;
    startPan: Point;
    startDistance: number;
    start: Point;
    startAt: number;
    axis: 'x' | 'y' | undefined;
    moved: boolean;
    pinched: boolean;
  }>({
    startScale: 1,
    startPan: { x: 0, y: 0 },
    startDistance: 0,
    start: { x: 0, y: 0 },
    startAt: 0,
    axis: undefined,
    moved: false,
    pinched: false,
  });
  const lastTap = useRef<{ at: number; point: Point } | undefined>(undefined);

  // A new photo starts whole and still.
  useEffect(() => {
    setScale(MIN_SCALE);
    setPan({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
    setFailed(false);
  }, [current, open]);

  // Neighbours are fetched ahead, from the addresses given and no others.
  useEffect(() => {
    if (!open) return;
    for (const next of [photos[current - 1], photos[current + 1]]) {
      if (next) new Image().src = next.src;
    }
  }, [open, current, photos]);

  const go = useCallback(
    (step: number) => {
      const next = stepIndex(current, step, count);
      if (next !== current) onIndexChange(next);
    },
    [current, count, onIndexChange],
  );

  const sizes = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    const image = imageRef.current;
    const box = { width: stage?.width ?? 0, height: stage?.height ?? 0 };
    // The photo as drawn at scale 1 (`object-fit: contain` inside the stage).
    const natural = {
      width: image?.naturalWidth || box.width,
      height: image?.naturalHeight || box.height,
    };
    const fit = Math.min(box.width / natural.width, box.height / natural.height) || 1;
    return { box, size: { width: natural.width * fit, height: natural.height * fit } };
  }, []);

  const zoomTo = useCallback(
    (next: number, focus: Point = { x: 0, y: 0 }) => {
      const to = clampScale(next);
      const { box, size } = sizes();
      setPan((from) => clampPan(panAfterZoom(from, focus, scale, to), size, box, to));
      setScale(to);
    },
    [scale, sizes],
  );

  // The arrow keys, home, end, plus and minus. Escape and Tab belong to the overlay's own trap.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'Home') onIndexChange(0);
      else if (event.key === 'End') onIndexChange(Math.max(0, count - 1));
      else if (event.key === '+' || event.key === '=') zoomTo(scale * 1.5);
      else if (event.key === '-') zoomTo(scale / 1.5);
      else if (event.key === '0') zoomTo(MIN_SCALE);
      else return;
      event.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, go, onIndexChange, count, zoomTo, scale]);

  const focusOf = (x: number, y: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect
      ? { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 }
      : { x: 0, y: 0 };
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.start = { x: event.clientX, y: event.clientY };
      g.startAt = event.timeStamp;
      g.startScale = scale;
      g.startPan = pan;
      g.axis = undefined;
      g.moved = false;
      g.pinched = false;
      setDragging(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pointer, Pointer];
      g.startDistance = distance(a, b);
      g.startScale = scale;
      g.startPan = pan;
      g.pinched = true;
      g.moved = true;
      setDrag({ x: 0, y: 0 });
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const { box, size } = sizes();
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pointer, Pointer];
      const to = pinchScale(g.startScale, g.startDistance, distance(a, b));
      const mid = midpoint(a, b);
      const focus = focusOf(mid.x, mid.y);
      setPan(clampPan(panAfterZoom(g.startPan, focus, g.startScale, to), size, box, to));
      setScale(to);
      return;
    }
    if (g.pinched) return;
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
    g.moved = true;
    if (scale > MIN_SCALE) {
      setPan(clampPan({ x: g.startPan.x + dx, y: g.startPan.y + dy }, size, box, scale));
      return;
    }
    g.axis ??= Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    setDrag(g.axis === 'x' ? { x: dx, y: 0 } : { x: 0, y: Math.max(0, dy) });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    setDragging(false);
    if (g.pinched) {
      g.pinched = false;
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (!g.moved) {
      // A tap: two close together zoom in or out around the point tapped.
      const tap = { at: event.timeStamp, point: { x: event.clientX, y: event.clientY } };
      if (isDoubleTap(lastTap.current, tap)) {
        lastTap.current = undefined;
        zoomTo(doubleTapScale(scale), focusOf(event.clientX, event.clientY));
      } else lastTap.current = tap;
      return;
    }
    if (scale > MIN_SCALE) return;
    const result = judgeDrag({
      dx: event.clientX - g.start.x,
      dy: event.clientY - g.start.y,
      ms: event.timeStamp - g.startAt,
      width: stageRef.current?.getBoundingClientRect().width ?? 1,
      hasPrevious: current > 0,
      hasNext: current < count - 1,
    });
    setDrag({ x: 0, y: 0 });
    if (result.kind === 'next') go(1);
    else if (result.kind === 'previous') go(-1);
    else if (result.kind === 'dismiss') onClose();
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current.pinched = false;
      setDragging(false);
      setDrag({ x: 0, y: 0 });
    }
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    // The wheel and a trackpad's pinch (which arrives as a wheel with the control key) zoom around the pointer.
    zoomTo(
      scale * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)),
      focusOf(event.clientX, event.clientY),
    );
  }

  function onStageKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Arrow keys with a zoomed photo move it, as a person who cannot drag would need.
    if (scale <= MIN_SCALE) return;
    const step = 60;
    const moves: Record<string, Point> = {
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
    };
    const move = moves[event.key];
    if (!move) return;
    const { box, size } = sizes();
    setPan((from) => clampPan({ x: from.x + move.x, y: from.y + move.y }, size, box, scale));
    event.stopPropagation();
    event.preventDefault();
  }

  if (!mounted || !portalTarget || !photo) return null;
  const isOpenPhase = phase === 'open';
  const fade = clamp(1 - drag.y / 400, 0.3, 1);
  const transform = `translate3d(${pan.x + drag.x}px, ${pan.y + drag.y}px, 0) scale(${scale})`;

  return createPortal(
    <div
      className={[styles.scrim, isOpenPhase ? styles.scrimOpen : ''].filter(Boolean).join(' ')}
      style={{ ['--photo-fade' as string]: String(fade) }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-roledescription="photo viewer"
        tabIndex={-1}
        className={styles.panel}
      >
        <div className={styles.bar}>
          <span className={styles.count} aria-live="polite" aria-atomic="true">
            {current + 1} of {count}
          </span>
          <button type="button" className={styles.control} aria-label="Close" onClick={onClose}>
            <Icon name="x" size="md" aria-hidden />
          </button>
        </div>

        {/* The stage is a pointer surface for gestures; the keyboard has its own, equal controls (the arrows, plus and minus, the buttons). */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- gesture surface; every gesture has a keyboard and button equivalent */}
        <div
          ref={stageRef}
          className={styles.stage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onWheel={onWheel}
          onKeyDown={onStageKeyDown}
        >
          {failed ? (
            <p className={styles.failed} role="status">
              This photo could not be shown.
            </p>
          ) : (
            <img
              ref={imageRef}
              key={photo.id}
              src={photo.src}
              alt={photo.alt}
              draggable={false}
              className={[styles.image, dragging ? styles.dragging : ''].filter(Boolean).join(' ')}
              style={{ transform }}
              onError={() => setFailed(true)}
            />
          )}
        </div>

        {current > 0 ? (
          <button
            type="button"
            className={[styles.control, styles.previous].join(' ')}
            aria-label="Previous photo"
            onClick={() => go(-1)}
          >
            <Icon name="chevron-left" size="md" aria-hidden />
          </button>
        ) : null}
        {current < count - 1 ? (
          <button
            type="button"
            className={[styles.control, styles.next].join(' ')}
            aria-label="Next photo"
            onClick={() => go(1)}
          >
            <Icon name="chevron-right" size="md" aria-hidden />
          </button>
        ) : null}

        {photo.caption ? <div className={styles.caption}>{photo.caption}</div> : null}
      </div>
    </div>,
    portalTarget,
  );
}
