# @sovereignfs/bridge

The device bridge: capability negotiation between an app's pages and a native shell
(Capacitor or Tauri), with a browser fallback. It has no runtime dependencies.

- **`@sovereignfs/bridge`** is the page side. Call `installWebBridge()` once from the app's
  client bootstrap; `getBridge()` reads the registration back. With no native shell, or a shell
  speaking another protocol version, it degrades to the `web` transport with no capabilities
  instead of failing.
- **`@sovereignfs/bridge/shell`** is the shell side, for native shells: `installBridge()` puts a
  narrow object on `window` for the page side to find. It is a separate entry point so neither
  side pulls the other's code.

```ts
import { getBridge, installWebBridge } from '@sovereignfs/bridge';

installWebBridge();
const handshake = await getBridge()?.handshake();
// { protocolVersion: 1, shell: { name: 'browser', platform: 'web', … }, capabilities: [] }
```

The contract (`BridgeHandshake`, `BridgeImpl`, `DeviceResult`, …) is exported as types. A capability
call never throws for an expected outcome: it returns `ok`, `unavailable`, `denied`, `dismissed` or
`failed`.

## License

[MPL-2.0](LICENSE).
