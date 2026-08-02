/**
 * Device bridge capability contract (RFC 0083, workstream 0003 leg 1) — on
 * its own dedicated subpath, deliberately separate from
 * `@sovereignfs/sdk/device-client` (RFC 0080's `useDeviceEnvironment`).
 *
 * That file imports React; this one must not, at all — `@sovereignfs/bridge`
 * imports `provideBridge` as a genuine runtime value (not just a type), and
 * React has no `"sideEffects": false` in its own `package.json`, so a
 * bundler that inlines this contract (rather than treating
 * `@sovereignfs/sdk` as external — which `@sovereignfs/bridge` cannot do,
 * since it takes the SDK as a **devDependency only** and must ship with no
 * runtime dependency on it) cannot tree-shake an unused React import out of
 * the same file even though nothing here calls it. Confirmed empirically:
 * co-locating this contract in `device-client.ts` pulled all of React
 * (~64KB) into `@sovereignfs/bridge`'s built `dist/index.js`, contradicting
 * this package's explicit "zero runtime dependencies, no React" requirement.
 *
 * This subpath owns the contract only — never an implementation. The
 * implementation (`web`/`capacitor`/`tauri` transports, wire protocol,
 * shell-side helper) is `@sovereignfs/bridge`, a separate published package.
 * `packages/sdk` has no `dependencies` field today and must not gain one —
 * see `docs/architecture-rules.md`'s SDK zero-deps rule.
 *
 * Registration mirrors `provideHost()` in `./host.ts`: `@sovereignfs/bridge`
 * calls `provideBridge()` once from a client bootstrap, the same handoff
 * `provideHost()` uses for the same problem (the SDK needing to call
 * something it must not depend on).
 *
 * v1 leg 1 ships the contract and registration only — no plugin-facing
 * capability calls (`supports()`, `haptics`, `nativeNotifications`) yet.
 * Those land in leg 2 (epic task 3.35) as new exports from
 * `@sovereignfs/sdk/device-client` instead — that surface is consumed by
 * plugin React components, which already depend on React, so co-locating
 * it there carries none of this file's bundling risk.
 */

/** How the current bridge implementation reaches the shell, if any. */
export type BridgeTransport = 'web' | 'capacitor' | 'tauri';

/** One capability a shell build advertises at handshake. */
export interface CapabilityDescriptor {
  /** e.g. `'haptics.impact'`. */
  name: string;
  /** Integer, incremented only on a breaking payload change. */
  version: number;
}

export interface BridgeHandshake {
  /** Framing/protocol version of `@sovereignfs/bridge` itself. */
  protocolVersion: number;
  shell: {
    /** e.g. `'sovereign-mobile'`, `'sovereign-desktop'`, or `'browser'` when no native shell is present. */
    name: string;
    /** Informational only — never branch on it. See "Capability negotiation" below. */
    version: string;
    /**
     * `'web'` covers the plain-browser case (including an installed PWA) —
     * not in RFC 0083's original enum, which only lists OS platforms for a
     * *native shell*. Added here because `BridgeImpl.handshake()` must
     * return a real `shell.platform` value in every case, including when no
     * native shell exists at all; inventing an OS value for that case would
     * misdescribe it.
     */
    platform: 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web';
  };
  /** Exactly what this shell build supports. The authoritative list. */
  capabilities: CapabilityDescriptor[];
}

/**
 * A capability call's outcome — never thrown for an expected outcome.
 * `denied` (persistent, e.g. OS-level refusal) and `dismissed` (this attempt
 * only) are kept distinct because they demand different follow-up UI.
 * Exceptions are reserved for programmer error (unknown capability name,
 * malformed payload), never for user or environment outcomes.
 */
export type DeviceResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; capability: string }
  | { status: 'denied' }
  | { status: 'dismissed' }
  | { status: 'failed'; error: string };

/** Implemented by `@sovereignfs/bridge`, never by plugin or platform code directly. */
export interface BridgeImpl {
  handshake(): Promise<BridgeHandshake>;
  invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>>;
}

/**
 * The bridge implementation is stored on `globalThis` under a `Symbol.for`
 * key, not a plain module-level variable — the same reasoning `./host.ts`
 * documents at length (Next compiles separate bundles per entry; dev HMR
 * resets module state), plus a second reason specific to this contract: a
 * plugin could install a different major of `@sovereignfs/bridge` than the
 * platform ships, giving two copies with two independent handshake states,
 * one of which would never resolve. A `Symbol.for` global makes one
 * registration win in both cases.
 */
const BRIDGE_KEY = Symbol.for('@sovereignfs/sdk:bridge');

interface BridgeHolder {
  [BRIDGE_KEY]?: BridgeImpl | null;
}

function holder(): BridgeHolder {
  return globalThis as unknown as BridgeHolder;
}

/**
 * Register the bridge implementation. Called once from a client bootstrap —
 * `@sovereignfs/bridge`'s `installWebBridge()` — before any plugin code runs.
 * Plugin code should never need to call this.
 */
export function provideBridge(impl: BridgeImpl): void {
  holder()[BRIDGE_KEY] = impl;
}

/**
 * Return the registered bridge implementation, or `null` if none is
 * registered yet (e.g. `@sovereignfs/bridge`'s client bootstrap hasn't run,
 * or this code is executing outside the Sovereign runtime, such as a unit
 * test). Not exported from the package barrel — `device-client.ts`'s
 * `supports()`/`getTransport()`/`getShellInfo()`/`haptics`/
 * `nativeNotifications` (leg 2, workstream 0003) are the intended callers.
 */
export function getBridge(): BridgeImpl | null {
  return holder()[BRIDGE_KEY] ?? null;
}
