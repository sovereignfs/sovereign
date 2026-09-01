import { Spinner } from '@sovereignfs/ui';
import styles from './warden.module.css';

/**
 * Route-level fallback shown the instant navigation to `/warden` starts,
 * while the page's Server Component resolves session data, provider/model
 * discovery, and message history — all of which can take a noticeable beat
 * on a cold cache (`model-discovery.ts`'s `DISCOVERY_CACHE_TTL_MS`). Without
 * this, clicking the Warden icon left the browser showing nothing at all
 * until every one of those awaits settled (found live investigating slow
 * Warden page loads).
 *
 * `data-plugin-fullbleed` matches `page.tsx`'s own root — the shell keys off
 * this attribute to hard-lock the viewport height for the whole route, so
 * the fallback needs it too or the layout would jump once the real page
 * mounts.
 */
export default function WardenLoading() {
  return (
    <div className={styles.page} data-plugin-fullbleed>
      <div className={styles.emptyState}>
        <Spinner label="Loading Warden…" />
      </div>
    </div>
  );
}
