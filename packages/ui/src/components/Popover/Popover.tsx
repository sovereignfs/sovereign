'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The element that opens the popover — rendered as-is; caller wires its onClick. */
  trigger: ReactElement;
  open: boolean;
  onClose: () => void;
  /** Which edge of the trigger the panel aligns to. Default: 'right'. */
  align?: 'left' | 'right';
  /** Panel width in px, or `'trigger'` to match the trigger element's own
   *  rendered width exactly (e.g. a dropdown under a full-width form field,
   *  where a fixed pixel width would either overflow or leave a gap
   *  depending on viewport size). Default: 288. */
  width?: number | 'trigger';
  /**
   * Inline style overrides for the panel, merged after `width`. Escape hatch
   * for callers that need to override the panel's own chrome (e.g. no
   * rounded corners for a compact swatch picker) — inline styles always win
   * regardless of CSS module load order, unlike passing an extra className.
   */
  panelStyle?: CSSProperties;
  'aria-label': string;
  children: ReactNode;
}

// Matches the gap already applied via .panel's `calc(100% + var(--sv-space-2))`
// offset — used here in plain px since layout math needs a number, not a
// CSS custom property.
const TRIGGER_GAP = 8;
// Breathing room kept between the panel and the viewport edge it's closest
// to — without this, a panel that just barely fits ends up flush against
// the edge (e.g. touching a mobile footer nav bar with no gap at all). Kept
// small deliberately: this subtracts directly from the space available
// before the internal-scroll cap kicks in (see the layout effect below), so
// a larger value here trades "more edge clearance" for "more panels that
// would otherwise fit exactly get an unwanted scrollbar instead" — a bad
// trade for a purely cosmetic gap.
const VIEWPORT_MARGIN = 4;

/**
 * Popover — floating panel anchored to a trigger element, below it by
 * default.
 *
 * Positioning is `position: absolute` inside a `position: relative` wrapper —
 * no floating-ui dependency. Supports left/right alignment against the trigger
 * edge, and automatically opens on whichever side (above or below the
 * trigger) has more room within the viewport.
 *
 * If the panel doesn't fit on *either* side as the trigger currently sits —
 * common for a tall panel (e.g. a full calendar month) nested partway down a
 * long scrollable mobile sheet — the trigger's scrollable ancestor is
 * scrolled so the trigger sits at the top of it first, maximizing the room
 * available below, then the panel opens downward against that. This mirrors
 * how most mobile date pickers behave (scroll the page, not the picker) and
 * avoids the panel needing its own internal scroll in the vast majority of
 * cases. If it's still too tall even after that (a genuinely tiny viewport,
 * or an unusually tall panel), it's capped to whatever room actually exists
 * and scrolls internally as a last resort, rather than rendering past the
 * edge of the viewport with no way to reach the rest of it.
 *
 * Closes on outside click or Escape. Does not trap focus (it is non-modal).
 */
export function Popover({
  trigger,
  open,
  onClose,
  align = 'right',
  width = 288,
  panelStyle,
  'aria-label': ariaLabel,
  children,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  // Whether the panel opens upward instead of downward. Defaults to false
  // (today's only behavior) so nothing shifts before this can actually be
  // measured.
  const [openUpward, setOpenUpward] = useState(false);
  // Caps the panel to whatever room actually exists on its chosen side, only
  // when the panel is taller than that — null leaves it at its natural
  // height, unconstrained, for the common case where it already fits.
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  // Horizontal viewport clamp, as a `left` override (container-relative px)
  // that replaces the `align`-driven `left: 0` / `right: 0` class rule —
  // null leaves alignment at its natural, class-driven position, for the
  // common case where the panel already fits. Needed because a fixed-width
  // panel anchored to one edge of a trigger near the *opposite* edge of a
  // narrow viewport (e.g. a 340px panel under a bell sitting near the right
  // edge of a 375px mobile screen) has nowhere to go but off-screen — the
  // existing vertical flip only ever solves the above/below axis, never
  // this one.
  const [horizontalOffset, setHorizontalOffset] = useState<number | null>(null);

  // width="trigger": measure the trigger's own rendered width and keep the
  // panel matching it, including live resizes (e.g. rotating the device, or
  // the trigger's own width changing for any other reason).
  useEffect(() => {
    if (width !== 'trigger') return;
    const el = containerRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    function recompute() {
      if (el) setTriggerWidth(el.getBoundingClientRect().width);
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // Collision detection: once open, measure the room available above and
  // below the trigger within the viewport. If neither side has enough for
  // the panel as things currently sit, scroll the trigger's scrollable
  // ancestor so the trigger sits at the top of it (scrollIntoView with
  // behavior: 'instant' applies synchronously, so re-measuring right after
  // reflects the new position with no extra frame to wait for) — this is
  // usually enough on its own to make the panel fit below. Whatever's left
  // after that: open on whichever side has more room, and only if it still
  // doesn't fit, cap the panel's height to that room (.panel's overflow-y:
  // auto then lets it scroll internally as a last resort, rather than
  // extending past the viewport edge with no way to reach the clipped part).
  // Runs in a layout effect (before paint) so there's no visible flash of
  // "opens one way, then snaps to the other" — measured and corrected within
  // the same commit the browser paints.
  useLayoutEffect(() => {
    if (!open) {
      setOpenUpward(false);
      setMaxHeight(null);
      setHorizontalOffset(null);
      return;
    }
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;

    // Arrow function expression, not a hoisted declaration — TypeScript only
    // preserves the non-null narrowing above for a closure defined after it.
    const measure = () => {
      const triggerRect = container.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      return {
        panelHeight,
        spaceBelow: window.innerHeight - triggerRect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN,
        spaceAbove: triggerRect.top - TRIGGER_GAP - VIEWPORT_MARGIN,
      };
    };

    let { panelHeight, spaceBelow, spaceAbove } = measure();
    if (panelHeight > spaceBelow && panelHeight > spaceAbove) {
      container.scrollIntoView({ block: 'start', behavior: 'instant' });
      ({ panelHeight, spaceBelow, spaceAbove } = measure());
    }

    const upward = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    setOpenUpward(upward);
    const available = upward ? spaceAbove : spaceBelow;
    setMaxHeight(panelHeight > available ? Math.max(available, 0) : null);

    // Horizontal clamp. Deliberately computed from `containerRect` (the
    // trigger's own position, never affected by anything this effect does)
    // and the panel's rendered *width* (also offset-independent) rather than
    // reading the panel's current `left`/`right` off the DOM — those reflect
    // whatever `horizontalOffset` a *previous* run of this same effect may
    // already have applied. Measuring the rendered position directly is not
    // idempotent: re-running this effect after it already nudged the panel
    // on-screen would see an already-corrected rect that looks like it never
    // needed correcting, and clear the very offset it just set (confirmed
    // live — React StrictMode's dev-only double-invoke of layout effects hit
    // exactly this: the second pass measured the first pass's fix as "fits
    // fine" and reset `horizontalOffset` back to null before first paint).
    // Rebuilding the *natural*, un-offset position analytically from the
    // same `align`-driven rule the CSS class itself encodes (`right: 0` /
    // `left: 0` relative to the container) sidesteps that entirely — the
    // same inputs always produce the same output, however many times this
    // runs.
    const containerRect = container.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const naturalLeft = align === 'right' ? containerRect.right - panelWidth : containerRect.left;
    const clampedLeft = Math.min(
      Math.max(naturalLeft, VIEWPORT_MARGIN),
      window.innerWidth - VIEWPORT_MARGIN - panelWidth,
    );
    setHorizontalOffset(clampedLeft !== naturalLeft ? clampedLeft - containerRect.left : null);
    // children included: content that changes the panel's height (e.g. a
    // calendar switching months to a row with fewer/more weeks) should
    // re-run this measurement, not just the open/close transition itself.
    // align included: the horizontal clamp above reads it directly.
  }, [open, children, align]);

  // Outside-click dismissal
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  // Escape key dismissal
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <div ref={containerRef} className={styles.container}>
      {trigger}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={ariaLabel}
          aria-modal={false}
          className={[styles.panel, styles[align], openUpward ? styles.upward : '']
            .filter(Boolean)
            .join(' ')}
          style={{
            width: width === 'trigger' ? (triggerWidth ?? undefined) : width,
            maxHeight: maxHeight ?? undefined,
            ...(horizontalOffset != null ? { left: horizontalOffset, right: 'auto' } : {}),
            ...panelStyle,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
