'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@sovereignfs/ui';
import styles from '../launcher.module.css';

export interface DirectoryPlugin {
  id: string;
  name: string;
  description: string | null;
  routePrefix: string;
}

function DirectoryRow({
  plugin,
  granted: initialGranted,
}: {
  plugin: DirectoryPlugin;
  granted: boolean;
}) {
  const [granted, setGranted] = useState(initialGranted);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/self-service`, {
        method: granted ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      setGranted(!granted);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sv-space-4)',
        padding: 'var(--sv-space-4)',
      }}
    >
      <div>
        <div style={{ fontWeight: 'var(--sv-font-weight-medium)' }}>{plugin.name}</div>
        {plugin.description && (
          <div style={{ fontSize: 'var(--sv-font-size-sm)', color: 'var(--sv-color-text-muted)' }}>
            {plugin.description}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 'var(--sv-font-size-sm)', color: 'var(--sv-color-text-muted)' }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-2)' }}>
        {granted && (
          <Link href={plugin.routePrefix} className={styles.emptyLink}>
            Open
          </Link>
        )}
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={toggle}>
          {pending ? '…' : granted ? 'Disable' : 'Enable'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Self-service plugin directory (RFC 0065 Task 15.3). Only rendered for
 * users holding `plugins:self-manage` (checked server-side before this
 * component is mounted at all — see `getSelfServiceDirectory` in
 * `../page.tsx`), listing `selected_users` + `self_service = true` plugins
 * split into "eligible, not yet enabled" and "already on".
 */
export function PluginDirectorySection({
  eligible,
  enabled,
}: {
  eligible: DirectoryPlugin[];
  enabled: DirectoryPlugin[];
}) {
  return (
    <section className={styles.adminSection}>
      <h2 className={styles.sectionTitle}>App directory</h2>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-muted)',
        }}
      >
        Apps you can turn on for yourself without an admin request.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-2)' }}>
        {enabled.map((plugin) => (
          <DirectoryRow key={plugin.id} plugin={plugin} granted={true} />
        ))}
        {eligible.map((plugin) => (
          <DirectoryRow key={plugin.id} plugin={plugin} granted={false} />
        ))}
      </div>
    </section>
  );
}
