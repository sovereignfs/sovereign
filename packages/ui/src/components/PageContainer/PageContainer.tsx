import type { HTMLAttributes, ReactNode } from 'react';
import styles from './PageContainer.module.css';

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Constrains and centers content width. Adds no padding of its own — the
   * runtime shell already pads plugin content. Defaults to 'md'. */
  maxWidth?: 'sm' | 'md' | 'lg' | 'full';
  children: ReactNode;
}

const maxWidthClass: Record<NonNullable<PageContainerProps['maxWidth']>, string> = {
  sm: styles.sm as string,
  md: styles.md as string,
  lg: styles.lg as string,
  full: styles.full as string,
};

export function PageContainer({
  maxWidth = 'md',
  className,
  children,
  ...rest
}: PageContainerProps) {
  const cls = [styles.container, maxWidthClass[maxWidth], className].filter(Boolean).join(' ');

  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
