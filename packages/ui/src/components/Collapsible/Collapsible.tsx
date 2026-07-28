'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Collapsible.module.css';

export interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}

/**
 * Collapsible — single expand/collapse primitive. Independently useful
 * (e.g. a "show more" toggle), and composed internally by `Accordion`.
 *
 * The expand/collapse animation uses `grid-template-rows: 0fr` → `1fr`
 * rather than animating `height`, which can't transition to/from `auto`
 * in CSS without JS-measuring pixel heights. Collapsed content stays in
 * the DOM (so no layout jump on re-open) but is marked `inert` — removed
 * from the tab order and the accessibility tree — so it isn't reachable
 * while hidden.
 */
export function Collapsible({
  open,
  onOpenChange,
  trigger,
  children,
  id,
  className,
}: CollapsibleProps) {
  const generatedId = useId();
  const contentId = `${id ?? generatedId}-content`;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onOpenChange(!open)}
      >
        <span className={styles.triggerLabel}>{trigger}</span>
        <Icon
          name="chevron-down"
          size="sm"
          aria-hidden
          className={[styles.chevron, open ? styles.chevronOpen : ''].filter(Boolean).join(' ')}
        />
      </button>
      <div
        id={contentId}
        className={styles.contentWrapper}
        data-open={open}
        inert={!open || undefined}
      >
        <div className={styles.contentInner}>{children}</div>
      </div>
    </div>
  );
}
