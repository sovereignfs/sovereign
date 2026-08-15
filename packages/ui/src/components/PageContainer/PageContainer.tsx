import type { HTMLAttributes, ReactNode } from 'react';
import styles from './PageContainer.module.css';

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Constrains and centers content width. The bound includes `padding`
   * (the container is `border-box`). Defaults to `'full'` — narrowing is
   * opt-in, so wrapping a page in `PageContainer` never silently clamps it.
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'full';
  /**
   * The page gutter. Responsive — each step is tighter at ≤768px. Defaults
   * to `'md'`, which is exactly what the runtime shell used to apply
   * (`--sv-space-8` desktop / `--sv-space-4` mobile), so a bare
   * `<PageContainer>` is the correct wrapper for a plugin that previously
   * relied on the shell for its padding.
   *
   * Use `'none'` when an ancestor already supplies the gutter — inside a
   * `Dialog`, whose own content region is padded.
   */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const maxWidthClass: Record<NonNullable<PageContainerProps['maxWidth']>, string> = {
  sm: styles.sm as string,
  md: styles.md as string,
  lg: styles.lg as string,
  full: styles.full as string,
};

const paddingClass: Record<NonNullable<PageContainerProps['padding']>, string> = {
  none: styles.padNone as string,
  sm: styles.padSm as string,
  md: styles.padMd as string,
  lg: styles.padLg as string,
};

/**
 * The shared page wrapper every plugin's own layout or page renders through.
 *
 * A plugin owns its page gutter; the runtime shell does not impose one
 * (task 9.25). The shell still reserves space for chrome a plugin cannot
 * know about — the offline banner's height and the mobile footer's — but it
 * contributes no inset of its own, so this component is the single place a
 * plugin's four-sided padding comes from.
 */
export function PageContainer({
  maxWidth = 'full',
  padding = 'md',
  className,
  children,
  ...rest
}: PageContainerProps) {
  const cls = [styles.container, maxWidthClass[maxWidth], paddingClass[padding], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
