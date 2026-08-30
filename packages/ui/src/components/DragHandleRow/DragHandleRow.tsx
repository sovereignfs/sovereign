import type { HTMLAttributes, ReactNode } from 'react';
import { GripIcon } from '../GripIcon/GripIcon';
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
        <GripIcon className={styles.icon} />
      </button>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
