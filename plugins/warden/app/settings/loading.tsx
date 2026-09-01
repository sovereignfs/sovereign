import { PageContainer, Spinner } from '@sovereignfs/ui';
import styles from './loading.module.css';

/**
 * Route-level fallback for `/warden/settings` — that page's Server Component
 * fetches providers, model discovery, visibility overrides, and the default
 * model all up front (`page.tsx`), which can take a noticeable beat on a
 * cold discovery cache. Mirrors the `sovereign-plugin-kanban`/`travellog`
 * `loading.tsx` convention.
 */
export default function WardenSettingsLoading() {
  return (
    <PageContainer maxWidth="md">
      <div className={styles.centered}>
        <Spinner label="Loading settings…" />
      </div>
    </PageContainer>
  );
}
