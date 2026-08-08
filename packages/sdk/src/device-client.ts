import { useEffect, useState } from 'react';
import { getBridge } from './device-bridge';
import type { BridgeHandshake, BridgeTransport, DeviceResult } from './device-bridge';
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

export type { BridgeTransport, DeviceResult } from './device-bridge';

/**
 * Device bridge plugin-facing surface (RFC 0083 §6, workstream 0003 leg 2).
 *
 * **A presentation/progressive-enhancement layer, never a security
 * boundary** — same posture as `useDeviceEnvironment()` above and
 * `docs/architecture-rules.md`'s device-bridge entry. `pluginId` is
 * self-declared by the calling plugin's own client-side code (there is no
 * server-injected header to trust here — this module is browser-only), so
 * `haptics`/`nativeNotifications` manifest permissions and consent grants
 * are review-time metadata and a consent-prompt input, not inter-plugin
 * isolation. Same posture as `offline:write` (RFC 0078 §6).
 */

let cachedHandshake: BridgeHandshake | null = null;
let handshakeStarted = false;

/**
 * Kicks off `BridgeImpl.handshake()` at most once and caches the result.
 * `supports()`/`getTransport()`/`getShellInfo()` are synchronous by design
 * (RFC 0083 §6: "capabilities are progressive enhancement; a component must
 * render a working state without them") — they read whatever is cached
 * *right now*, returning the safe default before the handshake resolves
 * rather than blocking on a promise.
 */
function ensureHandshakeStarted(): void {
  if (handshakeStarted) return;
  handshakeStarted = true;
  const bridge = getBridge();
  if (!bridge) return;
  void bridge.handshake().then((handshake) => {
    cachedHandshake = handshake;
  });
}

/** Whether `capability` is available at `version` or higher. `false` until the handshake resolves. */
export function supports(capability: string, version = 1): boolean {
  ensureHandshakeStarted();
  if (!cachedHandshake) return false;
  return cachedHandshake.capabilities.some((c) => c.name === capability && c.version >= version);
}

/** The active bridge transport. `'web'` before the handshake resolves. */
export function getTransport(): BridgeTransport {
  ensureHandshakeStarted();
  const platform = cachedHandshake?.shell.platform;
  if (platform === 'ios' || platform === 'android') return 'capacitor';
  if (platform === 'macos' || platform === 'windows' || platform === 'linux') return 'tauri';
  return 'web';
}

/** The native shell's identity, or `null` on the web transport / before the handshake resolves. */
export function getShellInfo(): BridgeHandshake['shell'] | null {
  ensureHandshakeStarted();
  if (!cachedHandshake || cachedHandshake.shell.platform === 'web') return null;
  return cachedHandshake.shell;
}

export const haptics = {
  /**
   * A brief haptic pulse. Needs no manifest permission or consent prompt
   * (RFC 0083 §7 — chosen as the first capability precisely because it's
   * trivial and has a clean no-op fallback). Tries the native bridge first;
   * on the web transport, falls back to the Vibration API where present.
   */
  async impact(style: 'light' | 'medium' | 'heavy' = 'medium'): Promise<DeviceResult<void>> {
    const bridge = getBridge();
    if (bridge) {
      const result = await bridge.invoke('haptics.impact', { style });
      if (result.status !== 'unavailable') return result as DeviceResult<void>;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const durationMs = style === 'light' ? 10 : style === 'heavy' ? 30 : 20;
      navigator.vibrate(durationMs);
      return { status: 'ok', value: undefined };
    }
    return { status: 'unavailable', capability: 'haptics.impact' };
  },
};

export const nativeNotifications = {
  /**
   * Current notification permission. On a native-bridge transport
   * (`supports('notifications.native')`) this is always `'granted'` — the
   * bridge exposes a single one-shot `show`, not a separate permission-query
   * action, and the OS itself gates the real permission at show()-time
   * (workstream 0003 leg 3: confirmed empirically against
   * `tauri-plugin-notification`'s native delivery, which handles OS
   * permission internally and reports failure through `show()`'s own
   * `DeviceResult`, not a queryable up-front state). On the web transport
   * this reads the platform signal directly — `'unsupported'` when the
   * Notification API doesn't exist at all.
   */
  async getPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (supports('notifications.native')) return 'granted';
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  },

  /**
   * Records a device-consent grant for `pluginId` (Account UI transparency
   * — see the file doc comment; not the enforcement mechanism), then asks
   * for notification permission. On a native-bridge transport this always
   * resolves `{ status: 'ok', value: 'granted' }` — see `getPermission()`'s
   * doc comment for why there's no real up-front permission gate to ask
   * for. On the web transport this is the standard
   * `Notification.requestPermission()` flow; the calling plugin's own UI
   * (e.g. an "Enable notifications" button) is what names the request to
   * the user — there is no separate platform-rendered prompt in v1 (see
   * workstream 0003 leg 2's scoping note).
   *
   * If `Notification.permission` is already `'denied'`, the browser will
   * not show a prompt again — returns `{ status: 'denied' }` immediately
   * rather than an `ok` result the caller might mistake for "just asked".
   */
  async requestPermission(pluginId: string): Promise<DeviceResult<'granted' | 'denied'>> {
    const native = supports('notifications.native');
    if (!native && typeof Notification === 'undefined') {
      return { status: 'unavailable', capability: 'notifications.native' };
    }
    if (!native && Notification.permission === 'denied') return { status: 'denied' };

    try {
      await fetch('/api/account/device-grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pluginId, capability: 'notifications.native' }),
      });
    } catch {
      // Grant bookkeeping is best-effort — a network failure here must not
      // block the actual permission request below.
    }

    if (native) return { status: 'ok', value: 'granted' };

    const permission = await Notification.requestPermission();
    if (permission === 'granted' || permission === 'denied') {
      return { status: 'ok', value: permission };
    }
    return { status: 'dismissed' };
  },

  /**
   * Show a notification now. Web tier uses the Web Notifications API
   * directly — the always-on, foreground-tab-appropriate mechanism,
   * distinct from the push/broker pipeline (RFC 0015/0016/0034) that
   * delivers `sdk.notifications.send()` calls to a possibly-closed tab.
   */
  async show(input: { title: string; body?: string; url?: string }): Promise<DeviceResult<void>> {
    const bridge = getBridge();
    if (bridge) {
      const result = await bridge.invoke('notifications.native', input);
      if (result.status !== 'unavailable') return result as DeviceResult<void>;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { status: 'unavailable', capability: 'notifications.native' };
    }
    try {
      const notification = new Notification(input.title, { body: input.body });
      if (input.url) {
        const url = input.url;
        notification.onclick = () => {
          window.open(url, '_blank');
        };
      }
      return { status: 'ok', value: undefined };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const camera = {
  /**
   * Captures a photo (device camera) or picks one from the library, per
   * `source`. Records a device-consent grant for `pluginId` first — same
   * best-effort bookkeeping as `nativeNotifications.requestPermission`, not
   * the enforcement mechanism (RFC 0083 §5b's honesty section). Camera
   * clearly "touches hardware", so it gets a grant the same way
   * `notifications.native` does; `haptics.impact` is the only capability
   * that skips this, per RFC 0083 §7.
   *
   * Bridge-first — on `capacitor`, the native side owns the OS permission
   * prompt inline (see `Bridge.swift`/`BridgeCapabilities.java`'s
   * `cameraPhoto`). On the web transport, falls back to a hidden
   * `<input type="file">`; `capture="environment"` hints at the device
   * camera for `source: 'camera'`, though the browser (not this code)
   * decides whether to honor that hint. There is no reliable cross-browser
   * "user cancelled the picker" signal for a bare file input, so a
   * cancelled pick on the web transport resolves `failed` rather than
   * `dismissed` — a known gap, not a silent bug.
   */
  async photo(
    source: 'camera' | 'library' = 'library',
    pluginId?: string,
  ): Promise<DeviceResult<{ dataUrl: string; mimeType: string }>> {
    if (pluginId) {
      try {
        await fetch('/api/account/device-grants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pluginId, capability: 'camera.photo' }),
        });
      } catch {
        // Grant bookkeeping is best-effort — see nativeNotifications.requestPermission.
      }
    }

    const bridge = getBridge();
    if (bridge) {
      const result = await bridge.invoke('camera.photo', { source });
      if (result.status !== 'unavailable') {
        return result as DeviceResult<{ dataUrl: string; mimeType: string }>;
      }
    }

    if (typeof document === 'undefined') {
      return { status: 'unavailable', capability: 'camera.photo' };
    }
    return pickViaFileInput(source);
  },
};

function pickViaFileInput(
  source: 'camera' | 'library',
): Promise<DeviceResult<{ dataUrl: string; mimeType: string }>> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') {
      input.capture = 'environment';
    }
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve({ status: 'failed', error: 'no file selected' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          status: 'ok',
          value: { dataUrl: reader.result as string, mimeType: file.type || 'image/jpeg' },
        });
      };
      reader.onerror = () => {
        resolve({ status: 'failed', error: 'could not read selected file' });
      };
      reader.readAsDataURL(file);
    });
    document.body.appendChild(input);
    input.click();
  });
}
