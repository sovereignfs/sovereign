import type { CSSProperties, ReactNode } from 'react';
import styles from './ScrollArea.module.css';

export interface ScrollAreaProps {
  children: ReactNode;
  /** Constrains the scrollable direction; content taller/wider than this scrolls. */
  maxHeight?: string | number;
  maxWidth?: string | number;
  className?: string;
}

/**
 * ScrollArea — a styled scrollable container (thin, token-colored scrollbar
 * instead of the OS default). Native overflow scrolling underneath — no
 * virtualization, no custom scroll physics.
 */
export function ScrollArea({ children, maxHeight, maxWidth, className }: ScrollAreaProps) {
  const style: CSSProperties = {};
  if (maxHeight !== undefined) style.maxHeight = maxHeight;
  if (maxWidth !== undefined) style.maxWidth = maxWidth;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}
