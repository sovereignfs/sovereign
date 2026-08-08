'use client';

import type { ReactNode } from 'react';
import { useIsOffline } from '../../hooks/useIsOffline';
import { EmptyState } from '../EmptyState/EmptyState';

export interface OfflineGateProps {
  children: ReactNode;
  /** Defaults to a generic "this section" phrasing — pass the surface's own name. */
  surfaceName?: string;
  className?: string;
}

/**
 * OfflineGate — blocks administrative/settings surfaces from rendering
 * (possibly stale) cached content while the device has no network, showing an
 * explanatory empty state instead (research 0012, epic task 2.32).
 *
 * Distinct from `OfflineBanner`: the banner is an informational overlay that
 * coexists with normal content everywhere in the shell. This is a hard block
 * for surfaces where operating against stale data is actively wrong — e.g. a
 * Console user list or an Account billing page reflects a point-in-time
 * snapshot the moment it's server-rendered, and any cached copy replayed
 * later has no way to signal that it may already be stale. `OfflineGate`
 * doesn't try to tell staleness apart from freshness; it removes the
 * question by not rendering the content at all while offline.
 *
 * `children` is rendered unconditionally while online, so this adds no cost
 * to the common case — it only decides what to show, never how the wrapped
 * content itself is fetched or cached.
 */
export function OfflineGate({ children, surfaceName, className }: OfflineGateProps) {
  const isOffline = useIsOffline();
  if (!isOffline) return <>{children}</>;

  return (
    <EmptyState
      icon="alert-triangle"
      heading="You're offline"
      description={`${surfaceName ?? 'This section'} needs a connection — reconnect to continue.`}
      className={className}
    />
  );
}
