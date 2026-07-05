'use client';

import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The element that opens the popover — rendered as-is; caller wires its onClick. */
  trigger: ReactElement;
  open: boolean;
  onClose: () => void;
  /** Which edge of the trigger the panel aligns to. Default: 'right'. */
  align?: 'left' | 'right';
  /** Panel width in px. Default: 288. */
  width?: number;
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

/**
 * Popover — floating panel anchored below a trigger element.
 *
 * Positioning is `position: absolute` inside a `position: relative` wrapper —
 * no floating-ui dependency. Supports left/right alignment against the trigger edge.
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
          role="dialog"
          aria-label={ariaLabel}
          aria-modal={false}
          className={[styles.panel, styles[align]].join(' ')}
          style={{ width, ...panelStyle }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
