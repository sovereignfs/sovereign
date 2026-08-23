'use client';

import type { ReactNode } from 'react';
import styles from './HeaderFooterLayout.module.css';

export interface HeaderFooterLayoutProps {
  /** Main content — required, always fills whatever height header/footer don't claim. */
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  /** px. Fixed height of the header, when present. Default 60 (matches
   *  MobileHeader/--sv-shell-header-height's own default). */
  headerHeight?: number;
  /** px. Fixed height of the footer, when present. Default 60 (matches
   *  MobileFooter/--sv-shell-footer-height's own default). */
  footerHeight?: number;
  className?: string;
}

/**
 * HeaderFooterLayout — header + main + optional footer, both fixed-height
 * and independently optional, with main always claiming the remaining
 * height. The vertical counterpart to ThreeColumnLayout: same purely
 * structural approach (no color/background opinions, no awareness of what's
 * inside each slot, no responsive behavior of its own — a plain flex
 * column), just rotated. "Footer always at the bottom" falls out of flex
 * layout alone; there is no position: fixed or safe-area handling here, so
 * a caller composing this with the platform shell's own chrome still owns
 * that separately.
 */
export function HeaderFooterLayout({
  children,
  header,
  footer,
  headerHeight = 60,
  footerHeight = 60,
  className,
}: HeaderFooterLayoutProps) {
  return (
    <div className={[styles.shell, className].filter(Boolean).join(' ')}>
      {header && (
        <div className={styles.header} style={{ height: headerHeight }}>
          {header}
        </div>
      )}
      <div className={styles.main}>{children}</div>
      {footer && (
        <div className={styles.footer} style={{ height: footerHeight }}>
          {footer}
        </div>
      )}
    </div>
  );
}
