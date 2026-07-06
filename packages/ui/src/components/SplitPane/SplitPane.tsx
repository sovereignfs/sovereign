'use client';

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SplitPane.module.css';

export interface SplitPaneProps {
  primary: ReactNode;
  secondary: ReactNode;
  defaultPrimarySize?: number;
  minPrimarySize?: number;
  maxPrimarySize?: number;
  resizable?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
  resizeLabel?: string;
  className?: string;
}

const clampSize = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * SplitPane — responsive two-pane layout for editor/preview and list/detail
 * workflows. Desktop panes can be resized; narrow viewports fall back to a
 * stable single-column stack.
 */
export function SplitPane({
  primary,
  secondary,
  defaultPrimarySize = 50,
  minPrimarySize = 30,
  maxPrimarySize = 70,
  resizable = true,
  primaryLabel = 'Primary pane',
  secondaryLabel = 'Secondary pane',
  resizeLabel = 'Resize panes',
  className,
}: SplitPaneProps) {
  const initialSize = clampSize(defaultPrimarySize, minPrimarySize, maxPrimarySize);
  const [primarySize, setPrimarySize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number } | null>(null);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        return;
      }

      const next = ((clientX - rect.left) / rect.width) * 100;
      setPrimarySize(clampSize(next, minPrimarySize, maxPrimarySize));
    },
    [maxPrimarySize, minPrimarySize],
  );

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) {
        return;
      }
      updateFromClientX(event.clientX);
    };

    const stopDragging = (event: globalThis.PointerEvent) => {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) {
        return;
      }
      dragState.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

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
  }, [updateFromClientX]);

  const startDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizable) {
      return;
    }
    dragState.current = { pointerId: event.pointerId };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 5;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPrimarySize((size) => clampSize(size - step, minPrimarySize, maxPrimarySize));
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPrimarySize((size) => clampSize(size + step, minPrimarySize, maxPrimarySize));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setPrimarySize(minPrimarySize);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setPrimarySize(maxPrimarySize);
    }
  };

  const style = {
    '--split-pane-primary-size': `${primarySize}%`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={[styles.splitPane, className].filter(Boolean).join(' ')}
      style={style}
    >
      <section className={styles.pane} aria-label={primaryLabel}>
        {primary}
      </section>
      {resizable && (
        <button
          type="button"
          className={styles.handle}
          aria-label={`${resizeLabel}, primary pane ${Math.round(primarySize)} percent`}
          onPointerDown={startDragging}
          onKeyDown={resizeWithKeyboard}
        />
      )}
      <section className={styles.pane} aria-label={secondaryLabel}>
        {secondary}
      </section>
    </div>
  );
}
