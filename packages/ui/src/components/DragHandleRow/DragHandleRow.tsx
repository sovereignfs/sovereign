import type { HTMLAttributes, ReactNode } from 'react';
import styles from './DragHandleRow.module.css';

export interface DragHandleRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Pass drag-listener and drag-control props from dnd-kit here. */
  handleProps?: HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
}

/**
 * A row wrapper that surfaces a drag handle on the left.
 * Consumers attach dnd-kit's useSortable listeners to `handleProps`.
 */
export function DragHandleRow({
  children,
  handleProps,
  isDragging,
  className,
  ...rest
}: DragHandleRowProps) {
  return (
    <div
      {...rest}
      className={[styles.row, isDragging ? styles.dragging : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className={styles.handle}
        tabIndex={-1}
        {...handleProps}
      >
        <DragIcon />
      </button>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function DragIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={styles.icon}
    >
      {/* Two columns of three dots */}
      {[3, 7, 11].map((cy) =>
        [4, 10].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} fill="currentColor" />
        )),
      )}
    </svg>
  );
}
