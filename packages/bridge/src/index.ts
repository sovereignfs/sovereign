import {
  provideBridge,
  type BridgeHandshake,
  type BridgeImpl,
  type DeviceResult,
} from '@sovereignfs/sdk/device-bridge';
import { PROTOCOL_VERSION, readInstalledBridge } from './protocol';

/**
 * Page side of the device bridge (`@sovereignfs/bridge`) — consumed by
 * `runtime`, never imported by plugin code directly (plugins use
 * `sdk.device.*`, landing in leg 2). Implements `BridgeImpl` and registers
 * it via `provideBridge()`.
 *
 * Detects a native shell by looking for what `@sovereignfs/bridge/shell`'s
 * `installBridge()` sets on `window` (`readInstalledBridge()`). No shell
 * present, or its `protocolVersion` doesn't match this build's, both
 * degrade to the `web` transport with an empty capability list rather than
 * failing (RFC 0083 open question 2) — an old shell must never hard-break
 * an instance, and a stale build should behave exactly like a plain
 * browser rather than throwing.
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
 * from `runtime`'s client bootstrap (see `runtime/src/bridge-client.ts`) —
 * plugin code should never need to call this.
 */
export function installWebBridge(): void {
  provideBridge(createBridgeImpl());
}
