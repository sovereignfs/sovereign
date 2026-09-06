import { Spinner } from '@sovereignfs/ui';
import styles from './console.module.css';

/**
 * Route-level pending UI for every Console section. Each page loader
 * self-fetches the runtime/auth admin APIs (bounded by
 * `_lib/fetch-timeout.ts`), so while that round-trip is in flight the main
 * column shows a spinner instead of staying blank — the sidebar and the
 * current section highlight stay put because this streams inside
 * `layout.tsx`'s persistent shell.
 */
export default function ConsoleLoading() {
  return (
    <div className={styles.loadingState} role="status" aria-live="polite">
      <Spinner />
      <span className={styles.textMuted}>Loading…</span>
    </div>
  );
}
