import type { BridgeHandshake, CapabilityDescriptor, DeviceResult } from './device-bridge';

/**
 * Wire protocol shared by the page side (`./index.ts`, published as
 * `@sovereignfs/bridge`) and the shell side (`./shell.ts`, published as
 * `@sovereignfs/bridge/shell`). Both import it; neither public entry point
 * re-exports it, so neither side pulls the other's code.
 *
 * The mechanism is a single global object a native shell installs on `window`
 * before the page's own scripts run. It is the standard pattern for this
 * problem (compare `window.ReactNativeWebView`, `window.Capacitor`).
 * `@sovereignfs/bridge/shell`'s `installBridge()` sets it; the page side looks
 * for it and falls back to the `web` transport when it is absent or when its
 * `protocolVersion` does not match this build's. That is a degrade with a
 * warning, never a failure, so an old shell can never hard-break an app.
 */
export const BRIDGE_GLOBAL_KEY = '__SOVEREIGN_BRIDGE__';

/** Framing/protocol version of `@sovereignfs/bridge` itself — bump on a wire-shape change. */
export const PROTOCOL_VERSION = 1;

/** The shape a shell installs at `window[BRIDGE_GLOBAL_KEY]`. */
export interface InstalledBridge {
  protocolVersion: number;
  shell: BridgeHandshake['shell'];
  capabilities: CapabilityDescriptor[];
  invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>>;
}

interface BridgeWindow {
  [BRIDGE_GLOBAL_KEY]?: InstalledBridge;
}

/** Read whatever a native shell installed, or `null` in a plain browser. */
export function readInstalledBridge(): InstalledBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as BridgeWindow)[BRIDGE_GLOBAL_KEY] ?? null;
}
