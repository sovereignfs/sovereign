import type { BridgeHandshake, CapabilityDescriptor, DeviceResult } from './device-bridge';
import { BRIDGE_GLOBAL_KEY, PROTOCOL_VERSION, type InstalledBridge } from './protocol';

/**
 * Shell-side helper (`@sovereignfs/bridge/shell`), used by the native shells
 * (`sovereign-mobile`, `sovereign-desktop`), never by an app's own code. It is a
 * separate entry point from the page side so neither pulls the other's code.
 *
 * Installing only this narrow object, not `window.Capacitor` or
 * `window.__TAURI__` themselves, is what makes native permission enforcement
 * real rather than aspirational. Whether a Capacitor shell can withhold
 * `window.Capacitor` from page scripts while still using Capacitor plugins
 * itself is for each shell to verify; this package only ships the mechanism.
 */ export interface ShellBridge {
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
 * shell's own bootstrap — since the first capability check an
 * app makes needs the handshake to already be answerable.
 */
export function installBridge(bridge: ShellBridge): void {
  const installed: InstalledBridge = { protocolVersion: PROTOCOL_VERSION, ...bridge };
  (window as unknown as BridgeWindow)[BRIDGE_GLOBAL_KEY] = installed;
}
