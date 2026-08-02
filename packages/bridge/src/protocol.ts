import type {
  BridgeHandshake,
  CapabilityDescriptor,
  DeviceResult,
} from '@sovereignfs/sdk/device-bridge';

/**
 * Wire protocol shared by the page side (`./index.ts`, published as
 * `@sovereignfs/bridge`) and the shell side (`./shell.ts`, published as
 * `@sovereignfs/bridge/shell`) — imported by both, pulled into neither's
 * public entry point, matching the "two entry points, so neither side pulls
 * the other's code" requirement (RFC 0083 §1, workstream 0003 leg 1).
 *
 * The mechanism itself is a single global object a native shell installs on
 * `window` before the page's own scripts run — RFC 0058/0038 both require
 * shells to inject state that way already (`window.__SOVEREIGN_DESKTOP__`
 * in `sovereign-desktop`), and it's the standard pattern for this exact
 * problem (compare `window.ReactNativeWebView`, `window.Capacitor`).
 * `@sovereignfs/bridge/shell`'s `installBridge()` sets it; this package's
 * page side looks for it and falls back to the `web` transport when absent
 * or when its `protocolVersion` doesn't match this build's (RFC 0083 open
 * question 2 — resolved here as degrade-with-a-warning, never fatal, so an
 * old shell can never hard-break an instance).
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
