import { Spinner } from '@sovereignfs/ui';
import styles from './warden.module.css';

/**
 * Route-level fallback shown the instant navigation into `/warden` starts,
 * before anything below the plugin's root layout has resolved. Sits *above*
 * `(chat)/layout.tsx`, so it covers that layout too — a `loading.tsx` only
 * wraps the page below its own segment, which is why the one inside
 * `(chat)/` on its own could not paint until the layout finished.
 *
 * With the `(chat)` layout now awaiting nothing this rarely shows for long,
 * but it stays as the safety net for the first flush (and it is what a
 * production `<Link>` prefetch can carry, so the click from the launcher or
 * the shell sidebar feels immediate). This exact file existed once before
 * (commit 5548c07d) and was removed when the shell moved into the layout —
 * the slow-launch regression that removal caused is why it is back.
 *
 * `data-plugin-fullbleed` matches the layout's own root — the shell keys
 * off this attribute to hard-lock the viewport height for the whole route,
 * so the fallback needs it too or the layout would jump once the real page
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
