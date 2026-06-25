import type { ReactNode } from 'react';
import styles from './SystemBanner.module.css';

export type BannerVariant = 'info' | 'warning' | 'error';

export interface SystemBannerProps {
  variant?: BannerVariant;
  /** Called when the user clicks ×. If omitted, no dismiss button is shown. */
  onDismiss?: () => void;
  children: ReactNode;
}

/**
 * SystemBanner — full-width sticky strip that shifts page content down.
 *
 * Used for platform-level notices: maintenance mode, license warnings, broadcast
 * messages. Stack multiple banners by rendering multiple `<SystemBanner>` elements.
 * The dismiss button is only rendered when `onDismiss` is provided.
 */
export function SystemBanner({ variant = 'info', onDismiss, children }: SystemBannerProps) {
  return (
    <div role="status" aria-live="polite" className={[styles.banner, styles[variant]].join(' ')}>
      <span className={styles.content}>{children}</span>
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label="Dismiss banner"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M1 1L13 13M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
