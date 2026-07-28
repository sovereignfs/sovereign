'use client';

import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from 'react';
import styles from './Resizable.module.css';

export type ResizableDirection = 'horizontal' | 'vertical';

export interface ResizablePanelProps {
  /** Initial size as a percentage of the group's main axis. Defaults to an
   * equal split across all panels in the group. */
  defaultSize?: number;
  /** Minimum size as a percentage. Defaults to 10. */
  minSize?: number;
  /** Maximum size as a percentage. Defaults to 90. */
  maxSize?: number;
  children?: ReactNode;
  className?: string;
  /** Injected by ResizablePanelGroup — not part of the public API. */
  style?: CSSProperties;
}

/** One pane of a ResizablePanelGroup. Sizing is computed and injected by the
 * group (via defaultSize/minSize/maxSize read off this element's props) —
 * this component only renders the scrollable content box. */
export function ResizablePanel({ children, className, style }: ResizablePanelProps) {
  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

export interface ResizableHandleProps {
  'aria-label'?: string;
  /** Injected by ResizablePanelGroup — not part of the public API. */
  direction?: ResizableDirection;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  'aria-valuenow'?: number;
  'aria-valuemin'?: number;
  'aria-valuemax'?: number;
}

/** The draggable divider between two ResizablePanels. Placed directly
 * between the two ResizablePanel elements it resizes — the group pairs each
 * handle with its preceding and following panel by position.
 *
 * A `div` with `role="separator"` and `tabIndex=0` (the WAI-ARIA "window
 * splitter" pattern), not a `<button>` — `separator` is a non-interactive
 * role, and a native button's implicit role can't be overridden to it. */
export function ResizableHandle({
  'aria-label': ariaLabel = 'Resize panels',
  direction = 'horizontal',
  onPointerDown,
  onKeyDown,
  'aria-valuenow': valueNow,
  'aria-valuemin': valueMin,
  'aria-valuemax': valueMax,
}: ResizableHandleProps) {
  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- WAI-ARIA "window splitter" pattern: a focusable, keyboard-operable separator is the documented exception to role="separator" being non-interactive (https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/). */
    <div
      className={[styles.handle, direction === 'vertical' ? styles.handleVertical : '']
        .filter(Boolean)
        .join(' ')}
      role="separator"
      tabIndex={0}
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      aria-valuenow={valueNow !== undefined ? Math.round(valueNow) : undefined}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}

export interface ResizablePanelGroupProps {
  direction: ResizableDirection;
  /** Alternating ResizablePanel / ResizableHandle elements — N panels
   * separated by N-1 handles. */
  children: ReactNode;
  className?: string;
}

interface PanelConstraint {
  defaultSize: number;
  minSize: number;
  maxSize: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * ResizablePanelGroup — a row or column of resizable panes (editor layouts,
 * multi-pane inspectors). Each handle resizes only its two immediate
 * neighbor panels (drag redistributes size between them, clamped to both
 * panels' own min/max, so their combined size is a fixed invariant for the
 * duration of one drag) — the same handle-local model most resizable-panel
 * implementations use, rather than redistributing across the whole group.
 *
 * Desktop-oriented, like NavigationMenu — a drag handle has no direct touch
 * equivalent; panels render at their default sizes on touch rather than
 * attempting a redesign no consumer has asked for yet. For a two-pane
 * layout that also needs a mobile single-column fallback, use SplitPane
 * instead.
 *
 * `direction="vertical"` needs a definite-height ancestor — percentage
 * flex-basis on a column's children only resolves against one.
 */
export function ResizablePanelGroup({ direction, children, className }: ResizablePanelGroupProps) {
  const elements = Children.toArray(children).filter(isValidElement) as ReactElement<
    ResizablePanelProps | ResizableHandleProps
  >[];
  const panelCount = elements.filter((el) => el.type === ResizablePanel).length;

  const constraints: PanelConstraint[] = elements
    .filter((el) => el.type === ResizablePanel)
    .map((el) => {
      const props = el.props as ResizablePanelProps;
      return {
        defaultSize: props.defaultSize ?? 100 / panelCount,
        minSize: props.minSize ?? 10,
        maxSize: props.maxSize ?? 90,
      };
    });

  const [sizes, setSizes] = useState<number[]>(() => constraints.map((c) => c.defaultSize));

  // A different set of panels rendered (count changed) — re-derive rather
  // than keep stale entries. Legal "adjust state during render" pattern;
  // sizes.length matches constraints.length again on the next render, so
  // this cannot loop.
  if (sizes.length !== constraints.length) {
    setSizes(constraints.map((c) => c.defaultSize));
  }

  const containerRef = useRef<HTMLDivElement>(null);
  // Always-latest refs so the window-level pointer listeners (registered
  // once, see below) never read stale values without needing to be
  // re-registered on every render.
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const dragState = useRef<{
    handleIndex: number;
    pointerId: number;
    startPos: number;
    startA: number;
    combined: number;
  } | null>(null);

  function applyResize(handleIndex: number, nextA: number, combined: number) {
    const a = constraintsRef.current[handleIndex];
    const b = constraintsRef.current[handleIndex + 1];
    if (!a || !b) return;
    const clampedA = clamp(
      nextA,
      Math.max(a.minSize, combined - b.maxSize),
      Math.min(a.maxSize, combined - b.minSize),
    );
    setSizes((prev) => {
      const next = [...prev];
      next[handleIndex] = clampedA;
      next[handleIndex + 1] = combined - clampedA;
      return next;
    });
  }

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      const drag = dragState.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!drag || !rect || event.pointerId !== drag.pointerId) return;
      const size = directionRef.current === 'horizontal' ? rect.width : rect.height;
      if (size === 0) return;
      const pos = directionRef.current === 'horizontal' ? event.clientX : event.clientY;
      const deltaPercent = ((pos - drag.startPos) / size) * 100;
      applyResize(drag.handleIndex, drag.startA + deltaPercent, drag.combined);
    }

    function stopDragging(event: globalThis.PointerEvent) {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) return;
      dragState.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // Registered once — handlePointerMove reads live state via refs instead
    // of closing over props/state that would otherwise need to be deps.
  }, []);

  function startDragging(handleIndex: number, event: ReactPointerEvent<HTMLDivElement>) {
    const startA = sizes[handleIndex] ?? 0;
    const startB = sizes[handleIndex + 1] ?? 0;
    dragState.current = {
      handleIndex,
      pointerId: event.pointerId,
      startPos: direction === 'horizontal' ? event.clientX : event.clientY,
      startA,
      combined: startA + startB,
    };
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(handleIndex: number, event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 5;
    const forwardKey = direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const backwardKey = direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const sizeA = sizes[handleIndex] ?? 0;
    const sizeB = sizes[handleIndex + 1] ?? 0;
    const combined = sizeA + sizeB;
    if (event.key === forwardKey) {
      event.preventDefault();
      applyResize(handleIndex, sizeA + step, combined);
    } else if (event.key === backwardKey) {
      event.preventDefault();
      applyResize(handleIndex, sizeA - step, combined);
    }
  }

  let panelIndex = -1;
  let handleIndex = -1;

  return (
    <div
      ref={containerRef}
      className={[styles.group, direction === 'vertical' ? styles.groupVertical : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {elements.map((element, key) => {
        if (element.type === ResizablePanel) {
          panelIndex += 1;
          const size = sizes[panelIndex] ?? constraints[panelIndex]?.defaultSize ?? 0;
          return (
            <ResizablePanelClone
              key={key}
              element={element as ReactElement<ResizablePanelProps>}
              flexBasis={size}
            />
          );
        }
        if (element.type === ResizableHandle) {
          handleIndex += 1;
          const index = handleIndex;
          const constraint = constraints[index];
          return (
            <ResizableHandleClone
              key={key}
              element={element as ReactElement<ResizableHandleProps>}
              direction={direction}
              aria-valuenow={sizes[index]}
              aria-valuemin={constraint?.minSize}
              aria-valuemax={constraint?.maxSize}
              onPointerDown={(e) => startDragging(index, e)}
              onKeyDown={(e) => resizeWithKeyboard(index, e)}
            />
          );
        }
        return element;
      })}
    </div>
  );
}

function ResizablePanelClone({
  element,
  flexBasis,
}: {
  element: ReactElement<ResizablePanelProps>;
  flexBasis: number;
}) {
  const style: CSSProperties = {
    ...element.props.style,
    flexBasis: `${flexBasis}%`,
    flexGrow: 0,
    flexShrink: 0,
  };
  return <ResizablePanel {...element.props} style={style} />;
}

function ResizableHandleClone({
  element,
  ...injected
}: {
  element: ReactElement<ResizableHandleProps>;
} & ResizableHandleProps) {
  return <ResizableHandle {...element.props} {...injected} />;
}
