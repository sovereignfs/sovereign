import { useEffect, useState } from 'react';
import type { Surface } from './device';

/**
 * Client-observable device environment (RFC 0080).
 *
 * Following the precedent set by `@sovereignfs/sdk/offline` and the
 * `e2ee-*` modules — the main barrel transitively reaches server-only
 * `next/headers` (via `device.ts`, `activity.ts`, etc.), and Next's
 * client/server boundary check flags the whole reachable module graph, so a
 * `'use client'` component importing from the barrel fails to build. Import
 * from this dedicated subpath instead:
 *
 * ```ts
 * import { useDeviceEnvironment } from '@sovereignfs/sdk/device-client';
 * ```
 */
export interface DeviceEnvironment {
  surface: Surface;
  /** Running as an installed PWA (`display-mode: standalone`). */
  installed: boolean;
}

/**
 * Parses the same `Sovereign-Shell/<mobile|desktop>-<platform> <version>`
 * User-Agent token the runtime middleware reads server-side
 * (`runtime/src/surface.ts`) — kept in sync by hand, since this module must
 * stay dependency-free and cannot import server code. See RFC 0080 §2.
 */
function surfaceFromUserAgent(userAgent: string): Surface {
  if (/Sovereign-Shell\/mobile-/.test(userAgent)) return 'mobile';
  if (/Sovereign-Shell\/desktop-/.test(userAgent)) return 'desktop';
  return 'browser';
}

/** Read the environment on the client. Safe to call only after mount. */
export function readEnvironment(): DeviceEnvironment {
  return {
    surface: surfaceFromUserAgent(navigator.userAgent),
    installed: window.matchMedia('(display-mode: standalone)').matches,
  };
}

/**
 * Environment as state, initialised to `null` and filled on mount.
 *
 * Deliberately returns `null` on first render rather than a plausible-looking
 * default — the caller must handle "not known yet" explicitly, which makes
 * the hard rule against reading browser globals in render impossible to
 * violate by accident.
 */
export function useDeviceEnvironment(): DeviceEnvironment | null {
  const [environment, setEnvironment] = useState<DeviceEnvironment | null>(null);
  useEffect(() => {
    setEnvironment(readEnvironment());
  }, []);
  return environment;
}
