import {
  provideBridge,
  type BridgeHandshake,
  type BridgeImpl,
  type DeviceResult,
} from './device-bridge';
import { PROTOCOL_VERSION, readInstalledBridge } from './protocol';

export { getBridge } from './device-bridge';
export type {
  BridgeHandshake,
  BridgeImpl,
  BridgeTransport,
  CapabilityDescriptor,
  DeviceResult,
} from './device-bridge';

/**
 * Page side of the device bridge (`@sovereignfs/bridge`). An app installs it
 * once from its client bootstrap with `installWebBridge()`, which implements
 * `BridgeImpl` and registers it via `provideBridge()`; `getBridge()` reads the
 * registration back.
 *
 * Detects a native shell by looking for what `@sovereignfs/bridge/shell`'s
 * `installBridge()` sets on `window` (`readInstalledBridge()`). No shell
 * present, or its `protocolVersion` doesn't match this build's, both
 * degrade to the `web` transport with an empty capability list rather than
 * failing — an old shell must never hard-break an app, and a stale build
 * should behave exactly like a plain browser rather than throwing.
 */

const WEB_SHELL: BridgeHandshake['shell'] = { name: 'browser', version: '', platform: 'web' };

function createBridgeImpl(): BridgeImpl {
  return {
    async handshake(): Promise<BridgeHandshake> {
      const native = readInstalledBridge();
      if (!native) {
        return { protocolVersion: PROTOCOL_VERSION, shell: WEB_SHELL, capabilities: [] };
      }
      if (native.protocolVersion !== PROTOCOL_VERSION) {
        console.warn(
          `@sovereignfs/bridge: installed shell speaks protocol v${native.protocolVersion}, ` +
            `this build speaks v${PROTOCOL_VERSION} — degrading to the web transport.`,
        );
        return { protocolVersion: PROTOCOL_VERSION, shell: WEB_SHELL, capabilities: [] };
      }
      return {
        protocolVersion: native.protocolVersion,
        shell: native.shell,
        capabilities: native.capabilities,
      };
    },

    async invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>> {
      const native = readInstalledBridge();
      if (!native || native.protocolVersion !== PROTOCOL_VERSION) {
        return { status: 'unavailable', capability };
      }
      return native.invoke(capability, payload);
    },
  };
}

/**
 * Register the web-and-native-detecting bridge implementation. Called once
 * from an app's client bootstrap; nothing else should need to call it.
 */
export function installWebBridge(): void {
  provideBridge(createBridgeImpl());
}
