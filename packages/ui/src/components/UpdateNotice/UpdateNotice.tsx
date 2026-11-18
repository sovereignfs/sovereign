import { Button } from '../Button/Button';
import styles from './UpdateNotice.module.css';

export interface UpdateNoticeProps {
  /** The app's name, as the person knows it. */
  appName: string;
  /** Called by **Reload**: the consumer activates the new version, then reloads. */
  onReload: () => void;
  /** Called by **Later**. If omitted, no Later button is shown. */
  onDismiss?: () => void;
  /** While the new version is taking over, **Reload** says so and cannot be pressed twice. */
  reloading?: boolean;
  className?: string;
}

/**
 * UpdateNotice — a quiet notice, fixed at the bottom of the window, that a new version of the app is ready and
 * takes over when the person chooses, so nothing they were doing is thrown away by a silent swap. The consumer
 * decides when to show it (a service worker waiting) and what Reload does.
 */
export function UpdateNotice({
  appName,
  onReload,
  onDismiss,
  reloading = false,
  className,
}: UpdateNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[styles.notice, className].filter(Boolean).join(' ')}
    >
      <p className={styles.text}>A new version of {appName} is ready.</p>
      <div className={styles.actions}>
        {onDismiss ? (
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={reloading}>
            Later
          </Button>
        ) : null}
        <Button size="sm" onClick={onReload} disabled={reloading}>
          {reloading ? 'Reloading…' : 'Reload'}
        </Button>
      </div>
    </div>
  );
}
