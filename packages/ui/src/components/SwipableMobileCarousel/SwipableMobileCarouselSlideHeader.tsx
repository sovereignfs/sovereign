import type { ReactNode } from 'react';
import styles from './SwipableMobileCarouselSlideParts.module.css';

export interface SwipableMobileCarouselSlideHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * SwipableMobileCarouselSlideHeader — always renders its children, no
 * loading concept. Meant for content already known synchronously (a list's
 * title, color, item count from data the caller already has) so it can
 * render immediately even while SwipableMobileCarouselSlideBody's own
 * content is still loading — see that component's doc comment.
 */
export function SwipableMobileCarouselSlideHeader({
  children,
  className,
}: SwipableMobileCarouselSlideHeaderProps) {
  return <div className={[styles.header, className].filter(Boolean).join(' ')}>{children}</div>;
}
