'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@sovereignfs/ui';
import type { ProviderView } from '../_lib/providers';
import type { ModelDiscoveryResult } from '../_lib/model-discovery';
import { AddProviderForm } from './AddProviderForm';
import { ProviderRow } from './ProviderRow';
import styles from './providers.module.css';

/**
 * Warden's model provider management page (RFC 0063 §4, epic task 22.4).
 * `providers`/`discovery` come from the Server Component page's own props —
 * this component holds no duplicate copy of them; every mutation below
 * calls `router.refresh()` to re-render the page with fresh server data,
 * the same pattern Console's `SmtpSettingsForm` already uses.
 */
export function ProvidersView({
  providers,
  discovery,
}: {
  providers: ProviderView[];
  discovery: ModelDiscoveryResult;
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const discoveryById = new Map(discovery.providers.map((entry) => [entry.id, entry]));

  return (
    <div className={styles.page}>
      <div className={styles.localStatus}>
        <p className={styles.helpText}>
          {discovery.local.available
            ? 'A local model on this server is available too, at no cost and with no key needed.'
            : (discovery.local.message ??
              "No local model is running on this server — that's fine, it's entirely optional.")}
        </p>
        <Button size="sm" variant="secondary" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? 'Checking…' : 'Recheck providers'}
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon="link"
          heading="No providers configured yet"
          description="Add an OpenAI-compatible endpoint below — OpenRouter, a direct provider, or your own self-hosted server."
        />
      ) : (
        <div className={styles.list}>
          {providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              discovery={discoveryById.get(provider.id)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <AddProviderForm onAdded={refresh} />
    </div>
  );
}
