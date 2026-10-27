/**
 * The device bridge contract: the types a page and a native shell agree on, and
 * the registration point for the page-side implementation.
 *
 * This file owns the contract only. The implementation (the `web`, `capacitor`
 * and `tauri` transports, the wire protocol, the shell-side helper) is the rest
 * of this package. It imports nothing, React included, so the package ships
 * with no runtime dependencies.
 *
 * Registration works like a service locator: `installWebBridge()` calls
 * `provideBridge()` once from an app's client bootstrap, and anything that needs
 * the bridge later reads it back with `getBridge()`.
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
    /** Informational only — never branch on it. Negotiate on `capabilities` instead. */
    version: string;
    /**
     * `'web'` covers the plain-browser case (including an installed PWA).
     * `handshake()` must return a real `shell.platform` in every case, including
     * when no native shell exists at all; inventing an OS value for that case
     * would misdescribe it.
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

/** Implemented by this package, never by app or platform code directly. */
export interface BridgeImpl {
  handshake(): Promise<BridgeHandshake>;
  invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>>;
}

/**
 * The implementation is stored on `globalThis` under a `Symbol.for` key, not in
 * a module-level variable. Next compiles a separate bundle per entry and dev
 * HMR resets module state, and an app can end up with two copies of this
 * package (two major versions, say), each with its own handshake state, one of
 * which would never resolve. A `Symbol.for` global makes one registration win in
 * every case.
 */
const BRIDGE_KEY = Symbol.for('@sovereignfs/bridge:registered');

interface BridgeHolder {
  [BRIDGE_KEY]?: BridgeImpl | null;
}

function holder(): BridgeHolder {
  return globalThis as unknown as BridgeHolder;
}

/**
 * Register the bridge implementation. Called once from a client bootstrap
 * (`installWebBridge()`) before any code that needs the bridge runs. App code
 * should never need to call this.
 */
export function provideBridge(impl: BridgeImpl): void {
  holder()[BRIDGE_KEY] = impl;
}

/**
 * Return the registered bridge implementation, or `null` if none is registered
 * yet (the client bootstrap has not run, or this code is executing outside a
 * browser, such as a unit test).
 */
export function getBridge(): BridgeImpl | null {
  return holder()[BRIDGE_KEY] ?? null;
}
