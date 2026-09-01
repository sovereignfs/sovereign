'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@sovereignfs/ui';
import { AddProviderForm } from './AddProviderForm';
import styles from '../warden.module.css';

/**
 * First-run empty state (RFC 0063 §4, epic task 22.4) — shown instead of the
 * ordinary chat view only when there's genuinely nothing to chat with yet
 * (no provider configured *and* no local model reachable). A provider that's
 * merely unreachable/erroring doesn't fall back here — that's an ordinary
 * degraded state the providers page itself surfaces, not a first-run state.
 *
 * "Add a provider" expands the same `AddProviderForm` `ProvidersView` uses,
 * in place, rather than immediately navigating to Settings — a user who
 * hasn't configured anything yet shouldn't be sent away from this screen
 * before they've had a chance to. Once the provider is actually created,
 * `onAdded` reveals the ordinary chat view in place — they came here to
 * chat, not to manage providers, and the ordinary chat view now has
 * something to show once at least one model is reachable.
 *
 * `onAdded` calls `router.refresh()`, not `router.push('/warden')` — this
 * component only ever renders *at* `/warden` (`page.tsx`'s `!hasAnyModel`
 * branch), so there is no URL to navigate to; the thing that actually needs
 * to change is server data. `push()` to the page's own current URL doesn't
 * reliably force that: Next's client Router Cache can still serve the
 * already-rendered (stale, `!hasAnyModel`) payload for that exact URL
 * instead of re-running the Server Component, which is what left a real
 * submission needing two manual reloads before the chat view appeared.
 * `refresh()` is the explicit "re-fetch this route's server data" call —
 * the same one `ProvidersView`'s own `refresh` uses after every mutation.
 *
 * `onAdded` is memoized (`useCallback`) rather than passed as an inline
 * closure — `AddProviderForm`'s success effect lists its `onAdded` prop as
 * a dependency, so a fresh function identity on every render would
 * retrigger that effect on its own, independent of whether the underlying
 * action state actually changed.
 */
export function SetupPrompt() {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const handleAdded = useCallback(() => router.refresh(), [router]);

  if (showForm) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.setupForm}>
          <AddProviderForm onAdded={handleAdded} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.emptyState}>
      <EmptyState
        icon="link"
        heading="Set up Warden"
        description="Add a model provider to start chatting — any OpenAI-compatible endpoint, or your own self-hosted server."
        action={<Button onClick={() => setShowForm(true)}>Add a provider</Button>}
      />
    </div>
  );
}
