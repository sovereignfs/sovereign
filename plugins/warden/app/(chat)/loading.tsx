import { Spinner } from '@sovereignfs/ui';
import styles from '../warden.module.css';

/**
 * Fallback for the chat column while its Server Component resolves session
 * data, provider/model discovery, and message history — any of which can
 * take a beat on a cold cache (`model-discovery.ts`'s
 * `DISCOVERY_CACHE_TTL_MS`). Without it, opening Warden left the browser
 * showing nothing at all until every await settled.
 *
 * Scoped to the chat column only. This sits inside `(chat)/layout.tsx`, so
 * the sidebar stays mounted and visible while this shows — previously the
 * shell lived in the page, which put the sidebar inside this same boundary
 * and made every "New chat" click blank the entire screen.
 *
 * No `data-plugin-fullbleed` here: the layout's own root already carries it
 * for the whole route.
 */
export default function WardenChatLoading() {
  return (
    <div className={styles.emptyState}>
      <Spinner label="Loading Warden…" />
    </div>
  );
}
