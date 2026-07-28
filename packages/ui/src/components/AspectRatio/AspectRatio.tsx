import type { ReactNode } from 'react';
import styles from './AspectRatio.module.css';

export interface AspectRatioProps {
  /** Width / height, e.g. 16 / 9 or 1. */
  ratio: number;
  children: ReactNode;
  className?: string;
}

/** AspectRatio — constrains content (image, video, embed) to a fixed ratio. */
export function AspectRatio({ ratio, children, className }: AspectRatioProps) {
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={{ aspectRatio: ratio }}
    >
      {children}
    </div>
  );
}
