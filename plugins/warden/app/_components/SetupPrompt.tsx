'use client';

import { useState } from 'react';
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
 * `onAdded` sends them on to `/warden/settings?tab=providers`, where they can
 * see it listed, recheck it, or add another.
 */
export function SetupPrompt() {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  if (showForm) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.setupForm}>
          <AddProviderForm onAdded={() => router.push('/warden/settings?tab=providers')} />
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
