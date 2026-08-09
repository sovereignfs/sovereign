'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '../EmptyState/EmptyState';

export interface DeviceOnlyGateProps {
  children: ReactNode;
  /** Defaults to a generic "this app" phrasing — pass the plugin's own name. */
  surfaceName?: string;
  /**
   * The caller's own `isDeviceOnlyTierAvailable()` result (from
   * `@sovereignfs/sdk/device-client`) — taken as a plain boolean rather than
   * computed inside this component, so `@sovereignfs/ui` never depends on
   * `@sovereignfs/sdk` (this package must stay usable standalone, outside the
   * plugin runtime — RFC 0073).
   */
  available: boolean;
  className?: string;
}

/**
 * DeviceOnlyGate — blocks a `device-only`-tier plugin's content from
 * rendering on a surface that cannot provide the durable, encrypted,
 * device-auth-gated store that tier requires, showing an explanatory empty
 * state instead of a broken screen (research 0012, epic tasks 2.33 + 3.36).
 *
 * A `device-only` plugin wraps its own root content in this the same way
 * Console and Account wrap theirs in `OfflineGate` — an opt-in pattern each
 * surface applies to itself, not a platform-level route gate. The launcher
 * tile's own "Phone only" badge (`useOfflineTileState`) is advisory UI on top
 * of this; this component is the actual gate, since a user can always reach a
 * route directly (a bookmark, a deep link) without passing through the
 * launcher tile at all.
 *
 * **Not a security boundary.** Availability here is a capability signal, not
 * an authorization check — the real protection for `device-only` data is
 * that it is encrypted and the key requires device auth to release (epic task
 * 1.22), so it stays inaccessible regardless of whether this gate is present,
 * bypassed, or simply never reached (e.g. a hand-crafted request against the
 * plugin's own API routes).
 */
export function DeviceOnlyGate({
  children,
  surfaceName,
  available,
  className,
}: DeviceOnlyGateProps) {
  if (available) return <>{children}</>;

  return (
    <EmptyState
      icon="smartphone"
      heading="Phone only"
      description={`${surfaceName ?? 'This app'} is only available on a phone with secure storage set up.`}
      className={className}
    />
  );
}
