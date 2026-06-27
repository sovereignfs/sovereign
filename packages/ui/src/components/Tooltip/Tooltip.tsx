import type { ReactElement } from 'react';
import { useId } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const sideClass: Record<NonNullable<TooltipProps['side']>, string> = {
  top: styles.top as string,
  bottom: styles.bottom as string,
  left: styles.left as string,
  right: styles.right as string,
};

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const tipId = useId();

  return (
    <span className={styles.wrapper}>
      {/* aria-describedby wires the tooltip text to the trigger for screen readers */}
      <span aria-describedby={tipId}>{children}</span>
      <span id={tipId} role="tooltip" className={[styles.tip, sideClass[side]].join(' ')}>
        {content}
      </span>
    </span>
  );
}
