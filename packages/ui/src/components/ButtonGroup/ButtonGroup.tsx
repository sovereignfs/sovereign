import type { ReactNode } from 'react';
import styles from './ButtonGroup.module.css';

export interface ButtonGroupProps {
  /** Adjacent Button elements. */
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * ButtonGroup — visually joins adjacent `Button`s into one control (shared
 * border, connected corners). Targets its children's rendered `<button>`/
 * `<a>` elements directly rather than requiring a special child component,
 * so it works with plain `Button`.
 */
export function ButtonGroup({ children, className, 'aria-label': ariaLabel }: ButtonGroupProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[styles.root, className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
