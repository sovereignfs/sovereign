import { useEffect, useState } from 'react';
import { getBridge } from './device-bridge';
import type { BridgeHandshake, BridgeTransport, DeviceResult } from './device-bridge';
import type { Surface } from './device';
import { isWebAuthnAvailable } from './device-only-crypto';
import { isOpfsAvailable } from './device-only-storage';

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
 * isolation — the same posture every self-declared manifest permission takes
 * in this system.
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

/**
 * Whether a `device-only`-tier plugin (research 0012, manifest `offline`)
 * can actually run here — i.e. whether a durable, encrypted,
 * device-auth-gated store is available. Deliberately **not**
 * `getSurface()`/`isNativeShell()`: those parse the client-controlled
 * User-Agent and are documented as a presentation hint only, never a
 * security boundary (`docs/architecture-rules.md`), so using one to gate an
 * entire storage tier would both be spoofable and conflate "probably mobile"
 * with "has secure storage" — wrong on both counts once Tauri desktop or a
 * sufficiently capable web backend eventually qualifies too.
 *
 * **Two independent backends, either one sufficient (RFC 0093 §1):** a
 * native shell via `supports('secureStorage')` — the real bridge-handshake
 * capability list, composing with the RFC 0083 "a shell must never
 * advertise a capability its build doesn't honor" rule for free — or plain
 * web/PWA via WebAuthn PRF + OPFS (`device-only-crypto.ts`/
 * `device-only-storage.ts`, `device-only-kv.ts`'s own storage layer), which
 * needs no bridge handshake at all. Checking only the bridge would report
 * `false` on every plain-browser tab even after the web backend shipped —
 * this function's own job is "can the tier run here," not "is a native
 * shell present," and the answer is yes on both paths once either backend
 * is available. The `secureStorage` check is tried first since it's a
 * simple lookup in an already-resolved handshake; the web check does two
 * synchronous capability probes with no ceremony or prompt.
 */
export function isDeviceOnlyTierAvailable(): boolean {
  return supports('secureStorage') || (isWebAuthnAvailable() && isOpfsAvailable());
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

export const biometrics = {
  /**
   * Confirms the current user's presence via the device's local biometric
   * sensor (Face ID / Touch ID / Android `BiometricPrompt`) — sovereign-mobile
   * epic task 20.7. A **local** confirmation gate, never a session grant:
   * see sovereign-mobile's ADR 0003 (cookie-in-WebView auth) — this
   * capability never authenticates against the platform by itself, it only
   * proves "the person holding this already-unlocked device is still here"
   * for a plugin's own high-trust local action (e.g. revealing a saved
   * secret, confirming a destructive local action). Records a
   * device-consent grant for `pluginId` first, same best-effort bookkeeping
   * as `camera.photo`/`nativeNotifications.requestPermission`.
   *
   * No web-transport fallback exists — WebAuthn is a fundamentally
   * different, session-granting mechanism, not a drop-in local-confirm
   * equivalent — so this reports `unavailable` outside a native bridge
   * transport. It also reports `unavailable` (not `denied`) on a real
   * device with no biometrics enrolled, matching `camera.photo`'s "no
   * camera hardware" case rather than "user declined."
   */
  async confirm(reason?: string, pluginId?: string): Promise<DeviceResult<void>> {
    if (pluginId) {
      try {
        await fetch('/api/account/device-grants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pluginId, capability: 'biometrics.confirm' }),
        });
      } catch {
        // Grant bookkeeping is best-effort — see nativeNotifications.requestPermission.
      }
    }

    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'biometrics.confirm' };
    }
    return (await bridge.invoke('biometrics.confirm', { reason })) as DeviceResult<void>;
  },
};

/**
 * Durable, encrypted, device-auth-gated plugin-scoped key/value storage
 * (RFC 0093, workstream 0008 leg 4) — the `device-only` offline tier's
 * storage primitive. Native Keychain/Keystore key custody + SQLCipher on
 * Capacitor, WebAuthn PRF key custody + OPFS on web; see the RFC for the
 * full design. Check `isDeviceOnlyTierAvailable()` (this module) before
 * relying on it — it reports `unavailable` with no bridge, same as
 * `biometrics`, since there is no meaningful web-transport fallback for a
 * capability whose entire purpose is hardware-backed key custody.
 *
 * Shape deliberately mirrors `@sovereignfs/sdk/offline`'s existing
 * `get`/`set`/`remove`/`keys`/`clear` (browser IndexedDB cache) rather than
 * inventing a new one — task 3.37 (unified offline storage SDK surface)
 * is expected to select between the two backends behind one plugin-facing
 * API, and a matching shape now means minimal translation then.
 *
 * One capability name (`'secureStorage'`), not one per operation like
 * `haptics.impact`/`camera.photo`/`biometrics.confirm` — the operations
 * here are CRUD on one logical store, not independent one-shot actions,
 * so they're distinguished by `op` in the invoke payload instead of by
 * capability name. `isDeviceOnlyTierAvailable()`'s `supports('secureStorage')`
 * check already assumes this single-name shape.
 *
 * **Deliberately does not record a device-consent grant per call**, unlike
 * `camera.photo`/`biometrics.confirm`/`nativeNotifications.requestPermission`.
 * RFC 0093 makes `device-only` enrollment structural — enabling the plugin
 * *is* the enrollment, with its own dedicated consent/warning flow (epic
 * task 1.22, Account UX) — so per-operation grant bookkeeping here would be
 * both redundant and a category error (there is no per-call "permission"
 * being requested, only ordinary reads/writes against an already-enrolled
 * store).
 */
export const secureStorage = {
  /** Read this plugin's stored value for `key`, or `null` if never written. */
  async get<T>(pluginId: string, key: string): Promise<DeviceResult<T | null>> {
    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'secureStorage' };
    }
    return (await bridge.invoke('secureStorage', {
      op: 'get',
      pluginId,
      key,
    })) as DeviceResult<T | null>;
  },

  /** Write/replace this plugin's stored value for `key`. */
  async set<T>(pluginId: string, key: string, value: T): Promise<DeviceResult<void>> {
    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'secureStorage' };
    }
    return (await bridge.invoke('secureStorage', {
      op: 'set',
      pluginId,
      key,
      value,
    })) as DeviceResult<void>;
  },

  /** Remove this plugin's stored value for `key`. No-op if it was never set. */
  async remove(pluginId: string, key: string): Promise<DeviceResult<void>> {
    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'secureStorage' };
    }
    return (await bridge.invoke('secureStorage', {
      op: 'remove',
      pluginId,
      key,
    })) as DeviceResult<void>;
  },

  /** List every key this plugin has stored (unprefixed — as passed to `set`). */
  async keys(pluginId: string): Promise<DeviceResult<string[]>> {
    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'secureStorage' };
    }
    return (await bridge.invoke('secureStorage', {
      op: 'keys',
      pluginId,
    })) as DeviceResult<string[]>;
  },

  /** Remove every stored value for this plugin. */
  async clear(pluginId: string): Promise<DeviceResult<void>> {
    const bridge = getBridge();
    if (!bridge) {
      return { status: 'unavailable', capability: 'secureStorage' };
    }
    return (await bridge.invoke('secureStorage', {
      op: 'clear',
      pluginId,
    })) as DeviceResult<void>;
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
