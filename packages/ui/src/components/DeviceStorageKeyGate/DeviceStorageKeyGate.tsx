'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '../EmptyState/EmptyState';

/**
 * `'checking'` covers the moment before the caller's own async status check
 * resolves — same transitional-state pattern `EncryptionSection`'s local
 * `LocalState` uses, so this gate never flashes an empty state before the
 * real answer is known. `'no-device-auth'` is the hard-block case (RFC 0093
 * §5, epic task 1.22): the environment supports the tier, but this device
 * has no passcode, fingerprint, or face unlock configured, so a key cannot
 * be created here at all — distinct from `'not-set-up'`, where it can.
 */
export type DeviceStorageKeyGateStatus =
  'checking' | 'unsupported' | 'no-device-auth' | 'not-set-up' | 'set-up';

export interface DeviceStorageKeyGateProps {
  children: ReactNode;
  /** Defaults to a generic "This app" phrasing — pass the plugin's own name. */
  surfaceName?: string;
  /**
   * The caller's own `getDeviceStorageKeyStatus()` result (from
   * `@sovereignfs/sdk/device-only-storage`) — taken as a plain status rather
   * than computed inside this component, so `@sovereignfs/ui` never depends
   * on `@sovereignfs/sdk` (same boundary `DeviceOnlyGate`'s `available` prop
   * draws — this package must stay usable standalone, outside the plugin
   * runtime — RFC 0073).
   */
  status: DeviceStorageKeyGateStatus;
  /**
   * Rendered under the "not set up" message — typically a link to Account →
   * Security. Not built in here: this package depends on no router, so the
   * caller supplies its own navigable element (a plain `<a>`, a framework
   * `<Link>`, whatever the host app uses).
   */
  setupAction?: ReactNode;
  className?: string;
}

/**
 * DeviceStorageKeyGate — blocks a `device-only`-tier plugin's content until
 * the user has set up their Device Storage Key (RFC 0093 §2, epic task
 * 1.22). Distinct from `DeviceOnlyGate`: that one checks whether the *tier
 * itself* is available on this surface (native shell, secure-storage bridge
 * present); this one checks whether the user has actually completed the
 * one-time, per-device enrollment that tier depends on. A `device-only`
 * plugin typically wants both — `DeviceOnlyGate` outermost (no point
 * checking enrollment on a surface that cannot offer the tier at all), this
 * gate inside it.
 *
 * Enrollment is centralized and decoupled from any single plugin (RFC 0093
 * §2): a plugin that finds no key set up does not run its own enrollment
 * ceremony inline. It stops here and points the user at Account → Security —
 * the one place enrollment happens for every `device-only` plugin on this
 * device — via `setupAction`, the same opt-in, self-applied pattern
 * `OfflineGate`/`DeviceOnlyGate` already use for their own surfaces.
 */
export function DeviceStorageKeyGate({
  children,
  surfaceName,
  status,
  setupAction,
  className,
}: DeviceStorageKeyGateProps) {
  if (status === 'checking') return null;
  if (status === 'set-up') return <>{children}</>;

  if (status === 'unsupported') {
    return (
      <EmptyState
        icon="smartphone"
        heading="Phone only"
        description={`${surfaceName ?? 'This app'} needs a security feature (WebAuthn PRF and Origin Private File System support) that isn't available here.`}
        className={className}
      />
    );
  }

  if (status === 'no-device-auth') {
    return (
      <EmptyState
        icon="alert-triangle"
        heading="Set up a device passcode"
        description={`${surfaceName ?? 'This app'} needs a passcode, fingerprint, or face unlock set up on this device before its Device Storage Key can be created. Set one up in your device's system settings, then come back.`}
        className={className}
      />
    );
  }

  return (
    <EmptyState
      icon="lock"
      heading="Set up your Device Storage Key"
      description={`${surfaceName ?? 'This app'} keeps its data only on this device, protected by a Device Storage Key you set up once in Account → Security.`}
      action={setupAction}
      className={className}
    />
  );
}
