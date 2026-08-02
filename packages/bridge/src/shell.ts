import type {
  BridgeHandshake,
  CapabilityDescriptor,
  DeviceResult,
} from '@sovereignfs/sdk/device-bridge';
import { BRIDGE_GLOBAL_KEY, PROTOCOL_VERSION, type InstalledBridge } from './protocol';

/**
 * Shell-side helper (`@sovereignfs/bridge/shell`) — consumed by the two
 * external shell repositories (`sovereign-mobile`, `sovereign-desktop`),
 * never by `runtime` or plugin code. Kept as a separate entry point from
 * `@sovereignfs/bridge`'s page side so neither pulls the other's code
 * (RFC 0083 §1).
 *
 * Installing only this narrow object — not `window.Capacitor` or
 * `window.__TAURI__` themselves — is what makes native permission
 * enforcement real rather than aspirational (RFC 0083 §5). Whether a
 * Capacitor shell can actually withhold `window.Capacitor` from page
 * scripts while still using Capacitor plugins itself is RFC 0083 open
 * question 6, answered in workstream 0003 leg 4 (`sovereign-mobile`) — not
 * here. This leg only ships the mechanism; each shell repo's own leg
 * verifies its enforcement claim.
 */
export interface ShellBridge {
  shell: BridgeHandshake['shell'];
  /** Exactly what this shell build supports — never advertise a capability the transport can't honor. */
  capabilities: CapabilityDescriptor[];
  invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>>;
}

interface BridgeWindow {
  [BRIDGE_GLOBAL_KEY]?: InstalledBridge;
}

/**
 * Install the shell's bridge on `window`, where `@sovereignfs/bridge`'s page
 * side finds it. Call once, as early as possible — before the page's own
 * scripts run, e.g. an `initialization_script`/`WKUserScript` context or the
 * shell's own bootstrap — since a plugin's first `supports()` call (leg 2)
 * needs the handshake to already be answerable.
 */
export function installBridge(bridge: ShellBridge): void {
  const installed: InstalledBridge = { protocolVersion: PROTOCOL_VERSION, ...bridge };
  (window as unknown as BridgeWindow)[BRIDGE_GLOBAL_KEY] = installed;
}
