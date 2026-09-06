'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './console.module.css';

/**
 * The only Overview stat that can't be fetched server-side alongside the
 * rest (`page.tsx`): external OAuth clients live in the auth server's own
 * `oauthClient` table, reachable only through `/api/auth/oauth2/get-clients`
 * — a browser-session-authenticated route (the same one
 * `OAuthClientsClient.tsx` already calls), not one of the admin-key-guarded
 * `/api/admin/*` routes every other Overview stat uses. Isolated in its own
 * client component so the rest of Overview stays a plain Server Component.
 */
export function ExternalClientsStat() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A non-OK response (an auditor gets 403 here) or a network failure is
    // "unknown", rendered as "—" — not a confident "0 clients".
    fetch('/api/auth/oauth2/get-clients', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((rows: unknown) => {
        if (!cancelled) setCount(Array.isArray(rows) ? rows.length : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link href="/console/oauth-clients" className={styles.statCard}>
      <span className={styles.statValue}>{count ?? '—'}</span>
      <span className={styles.statLabel}>External clients</span>
    </Link>
  );
}
