'use client';

import { useIsOffline } from './useIsOffline';

/**
 * The two reasons an app tile can be non-interactive, kept structurally
 * distinct because they have different causes and must never read as the same
 * thing to a user (research 0012, epic task 2.33):
 *
 * - `'connectivity-dimmed'` — a no-offline-tier app, dimmed only while the
 *   device is **actually offline right now**. Reactive and temporary; clears
 *   the instant connectivity returns.
 * - `'capability-restricted'` — a `device-only` app on a surface without the
 *   durable, encrypted, device-auth-gated store it needs. Static and
 *   unrelated to connectivity — it stays restricted even when fully online,
 *   and must never say "offline" to a user who plainly isn't.
 */
export type OfflineTileState = 'connectivity-dimmed' | 'capability-restricted' | null;

/**
 * Which of the two states, if any, applies to an app tile given its declared
 * offline tier.
 *
 * `deviceOnlyAvailable` is the caller's own
 * `isDeviceOnlyTierAvailable()` result (from
 * `@sovereignfs/sdk/device-client`) — deliberately taken as a plain boolean
 * parameter rather than computed inside this hook, so `@sovereignfs/ui` never
 * depends on `@sovereignfs/sdk` (this package must stay usable standalone,
 * outside the plugin runtime — RFC 0073).
 *
 * An `offline-first` app is never restricted by either state: that tier's
 * whole point is working with no network, so it stays fully interactive both
 * online and offline. A `device-only` app that *is* available behaves the
 * same way — the restriction is about availability, not connectivity.
 */
export function useOfflineTileState(
  offline: 'offline-first' | 'device-only' | undefined,
  deviceOnlyAvailable: boolean,
): OfflineTileState {
  const isOffline = useIsOffline();

  if (offline === 'device-only' && !deviceOnlyAvailable) return 'capability-restricted';
  if (offline === undefined && isOffline) return 'connectivity-dimmed';
  return null;
}
