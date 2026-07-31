import type { ReactNode } from 'react';
import styles from './SwipableMobileCarouselSlideParts.module.css';

export interface SwipableMobileCarouselSlideFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * SwipableMobileCarouselSlideFooter — always renders its children, no
 * loading concept. See SwipableMobileCarouselSlideHeader's doc comment.
 */
export function SwipableMobileCarouselSlideFooter({
  children,
  className,
}: SwipableMobileCarouselSlideFooterProps) {
  return <div className={[styles.footer, className].filter(Boolean).join(' ')}>{children}</div>;
}
