'use client';

import {
  KeyboardSensor,
  MouseSensor as LibMouseSensor,
  TouchSensor as LibTouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

/** Plain pointer drag (desktop, handle-initiated). */
const DEFAULT_MOUSE_ACTIVATION_DISTANCE_PX = 8;

/** Long-press-to-lift on touch. `delay` is how long a still hold takes before
 *  the row lifts; `tolerance` is how far the finger may drift during that
 *  hold before it's treated as a scroll instead — a finger that moves further
 *  than this within the delay window cancels activation and the native
 *  vertical scroll wins. */
const DEFAULT_TOUCH_ACTIVATION_DELAY_MS = 300;
const DEFAULT_TOUCH_ACTIVATION_TOLERANCE_PX = 8;

/**
 * True when a drag should be allowed to start from `target`. Refused when
 * `target` sits inside an element marked `data-no-dnd` — a nested control
 * (e.g. a visibility toggle) opts out so tapping it fires its own handler
 * instead of lifting the row. Exported standalone so it's unit-testable
 * without spinning up dnd-kit.
 */
export function shouldHandleDndEvent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return target.closest('[data-no-dnd]') === null;
}

export interface UseReorderSensorsOptions {
  mouseActivationDistancePx?: number;
  touchActivationDelayMs?: number;
  touchActivationTolerancePx?: number;
}

// dnd-kit's documented pattern for scoping sensor activation to specific
// elements: subclass the built-in sensor and replace its static `activators`
// with a handler that inspects the originating event's target before
// deferring to the base activation logic (distance/delay/tolerance), which
// dnd-kit re-checks internally regardless of what this returns.
class MouseSensor extends LibMouseSensor {
  static override activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent: event }: ReactMouseEvent) => shouldHandleDndEvent(event.target),
    },
  ];
}

class TouchSensor extends LibTouchSensor {
  static override activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent: event }: ReactTouchEvent) => shouldHandleDndEvent(event.target),
    },
  ];
}

/**
 * Sensor set for a `data-no-dnd`-aware drag-reorder list — MouseSensor for
 * desktop's handle-initiated drag, TouchSensor for mobile's long-press lift
 * (fixes reordering being unusable on iOS PWA/Safari, which never implements
 * the native HTML5 Drag-and-Drop API for touch input), KeyboardSensor
 * unchanged. A bare call keeps the historical 8px/300ms/8px defaults.
 */
export function useReorderSensors(options: UseReorderSensorsOptions = {}) {
  const {
    mouseActivationDistancePx = DEFAULT_MOUSE_ACTIVATION_DISTANCE_PX,
    touchActivationDelayMs = DEFAULT_TOUCH_ACTIVATION_DELAY_MS,
    touchActivationTolerancePx = DEFAULT_TOUCH_ACTIVATION_TOLERANCE_PX,
  } = options;
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: mouseActivationDistancePx } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: touchActivationDelayMs,
        tolerance: touchActivationTolerancePx,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
