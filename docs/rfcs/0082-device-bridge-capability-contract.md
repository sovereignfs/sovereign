# RFC 0082 — Device bridge and capability contract

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/sdk` (new `@sovereignfs/sdk/device-client` subpath — the
capability **contract** plus `provideBridge()`; stays dependency-free), new
`packages/bridge` (`@sovereignfs/bridge` — **published**; the **implementation**:
transports, protocol, and the shell-side helper consumed by `sovereign-mobile` and
`sovereign-desktop`),
`packages/manifest` (new `device:*` permissions), `runtime` (per-user device
consent grants), `plugins/account` (consent management UI),
`docs/plugin-development.md`, `docs/architecture-rules.md`,
`docs/sdk-stability.md`. Builds on RFC 0079 (surface model — supplies transport
detection); implements the "SDK abstraction" tier that RFC 0058 §"Device API
strategy" and RFC 0038 §"Device API tier" both specify but neither designs;
supersedes the `sdk.device.notify()` / `sdk.device.secureStore.*` sketches in
RFC 0038's epic tasks. Related research:
[0005](../research/0005-standalone-plugin-apps.md).\
**Incorporated into plan:** Yes — epic tasks 3.34–3.35.

---

## Summary

Define the contract by which web content running on a Sovereign instance reaches
**device capabilities** through a native shell — and make it one contract, shared
by the Capacitor mobile shell and the Tauri desktop shell, with a Web-API fallback
tier so the same plugin code runs unchanged in a plain browser.

Three pieces:

1. **A contract/implementation split** — `@sovereignfs/sdk/device-client` declares
   the capability registry, types, and `provideBridge()`; a new published
   `@sovereignfs/bridge` implements the transports and protocol and registers
   itself. Both external shell repositories consume the same published
   implementation, so the two shells cannot drift apart in protocol, and the SDK
   keeps its zero runtime dependencies by reusing the `provideHost()` handoff
   pattern.
2. **Capability negotiation** — the shell announces, at handshake, exactly which
   capabilities it supports and at which version. Plugins ask
   `supports('haptics.impact', 1)`. **Nothing ever compares shell versions.**
3. **`sdk.device.*` capability calls** — the plugin-facing surface, browser-only,
   returning a typed discriminated result rather than throwing, so "unavailable",
   "denied", "dismissed", and "failed" stay four distinct product outcomes.

v1 deliberately ships a **thin slice** — enough capabilities to prove the
contract, not the full device surface: `haptics.impact` and
`notifications.native` for plugins, plus a platform-internal `secureStorage`
tier. Every later capability (camera, biometrics, push, background) is an
additive registry entry plus two transport implementations, not a new mechanism.

## Motivation

RFC 0058 and RFC 0038 both state that plugin developers call `sdk.device.*` only,
and that the SDK "detects the environment and routes to the correct tier". Neither
designs that routing, and `packages/sdk/src/device.ts` does not exist. The
consequence today is six scheduled epic tasks (17.2, 17.4, 17.7, 20.3, 20.5–20.8)
that each presume a bridge nobody has specified — so each would arrive at its own,
and the mobile and desktop shells would diverge on the first capability that
shipped to both.

The immediate need is also concrete: the platform is preparing to serve three
surfaces at once — PWA (web and mobile), Tauri desktop, Capacitor mobile. The
shells live in separate repositories on their own release cadences. Without a
versioned protocol owned here, "the platform and plugin runtime serve all three
surfaces" is an aspiration rather than a contract.

## Current state (what this builds on)

- **`sdk.device.*` does not exist.** `packages/sdk/src/device.ts` is absent. Epic
  17.1's deliverables record the deferral explicitly: "`packages/sdk` patch — add
  `"desktop"` environment to `sdk.device.*` routing — **deferred to task 17.7**:
  `sdk.device.*` does not exist in `packages/sdk` yet". Task 17.7 then says that
  if the surface still hasn't landed, "ship the desktop check as part of its first
  implementation instead". That first implementation is RFC 0079's task 3.32; this
  RFC is the capability layer on top.
- **The entire `SdkHost` is server-side — and this is the load-bearing constraint
  for this RFC.** Every namespace in `packages/sdk/src/host.ts` (`db`, `mailer`,
  `email`, `platform`, `directory`, `data`, `activity`, `portability`, `plugins`,
  `notifications`, `storage`, `e2ee`, `secrets`, `connections`) routes through
  `requireHost()`, which reads a `Symbol.for('@sovereignfs/sdk:host')`-keyed
  global registered once from `runtime/instrumentation.ts`. **Device capabilities
  cannot use any of it** — a camera, a haptic motor, and a keychain live in the
  WebView, and no server round-trip can reach them.
- **The precedent to follow instead is `@sovereignfs/sdk/offline`.** Its own doc
  comment records why it is a dedicated subpath rather than part of the barrel:
  the barrel transitively reaches server-only `next/headers`, and Next's
  client/server boundary check flags the whole reachable module graph, so a
  `'use client'` component importing from the barrel fails to build. `offline.ts`
  has no `SdkHost` entry and no `provideHost()` wiring at all — architecturally
  unlike every other namespace. The device bridge is the second member of that
  family. The `e2ee-crypto` / `e2ee-device` modules are the third.
- **RFC 0079 supplies transport detection, not invocation.** Its server tier
  (`getSurface()` from the injected `x-sovereign-surface` header) and its client
  tier (`useDeviceEnvironment()`, `installed`) answer _where am I_. This RFC
  answers _what can I do here, and how do I ask_.
- **No capability-negotiation or feature-detection pattern exists in the repo.**
  `compatibility.minPlatformVersion` / `maxPlatformVersion`
  (`packages/manifest/src/schema.ts:241-251`, RFC 0024) gate a plugin against the
  platform — both of which the operator controls. A shell is controlled by
  neither the operator nor the platform, so that mechanism does not transfer.
- **The permission enum has no device entries.** `permissionSchema`
  (`packages/manifest/src/schema.ts:19-36`) currently holds `auth:session`,
  `db:readWrite`, `db:readOnly`, `mailer:send`, `mailer:sendExternal`,
  `storage:readWrite`, `notifications:send`, `events:publish`,
  `events:subscribe`, `data:provide`, `data:consume`, `data:export`,
  `data:import`, `activity:write`, `e2ee:use`, `admin:*`, `offline:write`.
- **RFC 0078 §6 established the honest position on permission enforcement**: a
  permission is centrally enforceable only where every call funnels through a
  shared host boundary the platform controls (as `mailer:send` does via
  `requireMailerPluginContext()` inside `provideHost({...})`). Where no such
  boundary exists, a permission is "review/install-time metadata with an optional
  convenience helper, not a guarantee". That precedent applies here and is
  sharpened in §5.
- **Notification infrastructure already exists** — RFC 0015's Notification Center
  and RFC 0016's web push, with `sdk.notifications.send()` server-side and a
  pluggable transport broker (RFC 0034). The web tier of `notifications.native`
  should route into this rather than parallel it.
- **`@sovereignfs/sdk` and `@sovereignfs/ui` are published contracts under
  NFR-04**: patch releases must never contain breaking changes; a breaking change
  needs at minimum a minor bump plus a migration note. A capability registry must
  therefore be designed for additive growth from day one.

## Proposed design

### 1. Contract in the SDK, implementation in `@sovereignfs/bridge`

The split follows the pattern this repository already uses for exactly this
problem — the SDK needing to call something it must not depend on.

**`@sovereignfs/sdk/device-client`** (a new subpath, joining the five that already
exist) owns the **contract**:

- The capability registry: capability names, versions, request/response types.
- `DeviceResult` and the handshake shape.
- The plugin-facing `sdk.device.*` API.
- `provideBridge(impl)` — the registration entry point.

**`@sovereignfs/bridge`** (new package at `packages/bridge`, published) owns the
**implementation**:

- The `web`, `capacitor`, and `tauri` transports.
- The wire protocol and handshake mechanics.
- The shell-side handler helper.

The SDK keeps **zero runtime dependencies**. `@sovereignfs/bridge` depends on
`@sovereignfs/sdk` as a **`devDependency` only** — types are erased at build, so
its published output carries no runtime dependency while the type contract still
has exactly one source of truth. The dependency arrow points
implementation → contract, the same direction `runtime` → `@sovereignfs/sdk`
already points.

Registration mirrors `provideHost()`:

```ts
// @sovereignfs/sdk/device-client — declares, never implements
export interface BridgeImpl {
  handshake(): Promise<BridgeHandshake>;
  invoke(capability: string, payload: unknown): Promise<DeviceResult<unknown>>;
}
export function provideBridge(impl: BridgeImpl): void;
```

`runtime` registers it from a client bootstrap — the client-side analogue of
`runtime/instrumentation.ts` calling `provideHost()`.

**The registration must be stored on a `Symbol.for`-keyed global, not a
module-level variable**, for the reason `packages/sdk/src/host.ts` already
documents at length: Next compiles instrumentation, route handlers, and server
actions into separate bundles that each get their own module instance, and dev HMR
resets module state. There is a second reason here — a plugin could install a
different major of `@sovereignfs/bridge` than the one the platform ships, giving
two copies with two independent handshake states, one of which would never
resolve. A `Symbol.for` global makes one registration win in both cases.

**Two entry points**, so neither side pulls the other's code:

| Entry                       | Consumer              | Contains                     |
| --------------------------- | --------------------- | ---------------------------- |
| `@sovereignfs/bridge`       | `runtime` (page side) | Transports, handshake client |
| `@sovereignfs/bridge/shell` | the two shell repos   | Shell-side handler helper    |

`@sovereignfs/bridge` itself has zero runtime dependencies — no React, no Next,
no Node built-ins — and never reaches `next/headers`, `@sovereignfs/db`, or
anything in `SdkHost`. It is published and semver-disciplined like the SDK,
because two external repositories on independent release cadences consume it.

> **Why not simply have `packages/sdk` depend on `@sovereignfs/bridge`?** It was
> the first design considered and it is worse on the facts. `packages/sdk` has no
> `dependencies` field at all today — `next` is a `peerDependency` and everything
> else is a devDependency — and `@sovereignfs/ui` is the same. "SDK zero-deps" is
> therefore a literal, uniform property of both published packages rather than a
> rule about two specific imports, and a real dependency at version 1.27.0 would
> be the first. It would also make the dual-major duplication problem above a live
> risk instead of a guarded one, and give plugin developers a transitive install
> for a package they should never need to know exists. The `provideHost()` pattern
> costs nothing and needs no rule amendment.

### 2. Transports

```ts
export type BridgeTransport = 'web' | 'capacitor' | 'tauri';
```

| Transport   | Mechanism                                       | Notes                                                    |
| ----------- | ----------------------------------------------- | -------------------------------------------------------- |
| `capacitor` | Capacitor plugin calls, mediated by the shell   | Promise-based, plugin-namespaced                         |
| `tauri`     | Tauri command invocation, mediated by the shell | Command-name based — a structurally different shape      |
| `web`       | Standard Web APIs                               | The always-available floor; reports the rest unavailable |

The two native bridge shapes are genuinely different, which is precisely why
plugins must not touch them. RFC 0058 already requires this ("Plugin developers
call `sdk.device.*` only. They do not import Capacitor plugins or branch directly
on native shell internals"); this RFC makes it mechanically true.

### 3. Handshake and capability negotiation

```ts
export interface CapabilityDescriptor {
  name: string; // e.g. 'haptics.impact'
  version: number; // integer, incremented on a breaking payload change
}

export interface BridgeHandshake {
  /** Framing/protocol version of @sovereignfs/bridge itself. */
  protocolVersion: number;
  shell: {
    name: string; // 'sovereign-mobile' | 'sovereign-desktop' | …
    version: string; // informational only — never branch on it
    platform: 'ios' | 'android' | 'macos' | 'windows' | 'linux';
  };
  /** Exactly what THIS shell build supports. The authoritative list. */
  capabilities: CapabilityDescriptor[];
}
```

**The rule that makes cross-cadence releases survivable:**

> Plugins and the platform never compare shell versions. They ask whether a
> named capability at a given version is present. `shell.version` exists for
> diagnostics and bug reports only, and branching on it is a review-blocking
> mistake.

This is not stylistic. A shell updates on the **user's** schedule — via an app
store, subject to a review queue, and often with auto-update disabled entirely —
while the instance updates on the **operator's** schedule. Skew is therefore
normal and runs in both directions:

| Situation                  | Behavior under negotiation                                                       |
| -------------------------- | -------------------------------------------------------------------------------- |
| New instance, old shell    | Newer capability simply absent from `capabilities` → `unavailable`, handled path |
| Old instance, new shell    | Unknown capability names ignored; nothing breaks                                 |
| Capability payload changed | Shipped as a new `version`; the shell may advertise both while clients migrate   |
| Shell not present at all   | Transport is `web`; capabilities resolve to the Web-API floor or `unavailable`   |

No coordinated release is ever required between this repository and either shell
repository. That property is the main reason this RFC exists as a protocol rather
than a set of per-capability SDK methods.

### 4. Typed results — no throws for expected outcomes

```ts
export type DeviceResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; capability: string } // not on this surface, or shell too old
  | { status: 'denied' } // user/OS refused, persistently
  | { status: 'dismissed' } // user cancelled this attempt
  | { status: 'failed'; error: string }; // hardware or runtime error
```

`denied` and `dismissed` are deliberately distinct, because they demand different
UI: a denied capability needs a "you'll need to enable this in Settings" path,
since asking again will not prompt; a dismissed one should simply let the user try
again. Collapsing them — or collapsing either into a thrown error — destroys
information the caller cannot recover, and it is the single most common way device
abstractions become unpleasant to use.

Exceptions are reserved for programmer error (unknown capability name, malformed
payload), never for user or environment outcomes.

### 5. Permission model — and where it genuinely bites

Two layers, plus the OS.

**a. Manifest declaration.** New `device:*` entries in `permissionSchema`:

```jsonc
{ "permissions": ["device:haptics", "device:notifications"] }
```

v1 adds only the capabilities v1 ships (§7). Each later capability adds its own
permission in the same task that adds the capability — never a broad
`device:*` grant.

**b. Per-user runtime consent.** For any capability that touches personal data or
hardware the user would reasonably want to control, the platform records a
per-user, per-plugin, per-capability grant, managed in the Account plugin
alongthe existing data-consent surface (`packages/sdk/src/data.ts`'s consent
model is the precedent). Absent a grant, the bridge prompts once and stores the
outcome; a `denied` grant short-circuits without reaching the OS.

**c. The OS prompt** still applies on top, and always wins.

**Now the honest part, stated plainly because it would otherwise be assumed
away.**

**Client-side plugin identity is self-declared and not verifiable.**
`x-sovereign-plugin-id` is a _server_ header injected by middleware. In the
browser, every plugin's client code shares one origin and one JavaScript context,
so any client code can claim any plugin id when calling the bridge. Consequently:

| What                                                         | Enforcement strength                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Native-only capability, shell exposes only the narrow bridge | **Real** — the bridge is the sole route to the native API, so an undeclared capability call can be refused |
| Web-API-backed capability                                    | **Advisory** — a plugin can call `navigator.*` directly; the platform cannot intercept browser globals     |
| Isolation _between_ plugins                                  | **None client-side** — same origin, same JS context, self-declared identity                                |

So `device:*` permissions are install-time and review-time metadata plus the
input to an honest consent prompt ("_Tally_ wants to use haptics"), **not** a
security boundary between plugins. This is the same conclusion RFC 0078 §6 reached
for `offline:write` and the same posture RFC 0079 §2 takes on the surface signal.
`docs/plugin-development.md` must say so in those words.

**The one structural lever, and it is a shell requirement:**

> The shell should expose **only** the narrow bridge surface to page JavaScript,
> not raw `window.Capacitor`, `window.__TAURI__`, or any direct plugin/command
> object. That is what makes the first row of the table above true rather than
> aspirational, and it belongs in both shell repositories' review checklists.

**How achievable that is differs by shell, and the difference is not yet
verified.** Tauri's command surface is opt-in — the shell declares which commands
exist, so exposing only bridge commands is straightforward. Capacitor, by
contrast, **injects its own runtime into the WebView by design**, and page
JavaScript is the intended caller of `Capacitor.Plugins.*`. Whether a Capacitor
shell can meaningfully withhold that object from page scripts while still using
Capacitor plugins itself is an open implementation question.

If it cannot, the honest consequence is that on the `capacitor` transport the
first row of the table collapses into the second — native capability permissions
become advisory there too, and the enforcement claim holds only for Tauri. That
would not invalidate the contract (portability, negotiation, and typed results are
unaffected), but it would need saying in `docs/plugin-development.md` rather than
quietly leaving a stronger claim in place. **Verify before relying on the
enforcement claim for mobile** — workstream 0003 leg 4.

### 6. Plugin-facing surface

On the existing browser-only subpath from RFC 0079:

```ts
// @sovereignfs/sdk/device-client
export function supports(capability: string, version?: number): boolean;
export function getTransport(): BridgeTransport;
export function getShellInfo(): BridgeHandshake['shell'] | null;

export const haptics: {
  impact(style?: 'light' | 'medium' | 'heavy'): Promise<DeviceResult<void>>;
};

export const nativeNotifications: {
  show(input: { title: string; body?: string; url?: string }): Promise<DeviceResult<void>>;
  getPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>;
  requestPermission(): Promise<DeviceResult<'granted' | 'denied'>>;
};
```

`supports()` is synchronous and safe to call in render **only after mount** —
before the handshake resolves it returns `false`. This is deliberate and matches
`useDeviceEnvironment()` returning `null` pre-mount: capabilities are progressive
enhancement, and a component must render a working state without them.

### 7. v1 capability slice

Deliberately thin — enough to prove negotiation, permissions, transports, and
result semantics end to end.

| Capability             | Plugin-facing | capacitor          | tauri               | web                                   |
| ---------------------- | ------------- | ------------------ | ------------------- | ------------------------------------- |
| `haptics.impact`       | Yes           | Haptics plugin     | no-op `unavailable` | Vibration API where present           |
| `notifications.native` | Yes           | Local notification | OS notification     | Web Notifications / existing web push |
| `secureStorage.*`      | **No**        | Keychain/Keystore  | Keychain equivalent | `unavailable`                         |

**`haptics.impact`** is chosen first precisely because it is trivial, needs no
permission prompt, and has a clean no-op fallback — it proves the round trip
without any of the interesting risk.

**`notifications.native`** is the first capability with real product value, and
its web tier routes into the already-shipped Notification Center / web push
infrastructure rather than paralleling it. This is the "SDK routes to the correct
tier" promise made real on shipped code.

**`secureStorage` is platform-internal in v1, not plugin-facing** — and that is a
direct consequence of §5. Since client-side plugin identity is self-declared, a
plugin-facing keychain would let any plugin's client code read any other's
entries. Scoping it to the shell and platform (its actual first consumer is
RFC 0081 §5's durable-session sequel — storing an OAuth refresh token in the OS
keychain) sidesteps that entirely. Exposing it to plugins requires a verifiable
client-side identity mechanism, which does not exist and is out of scope here.

### 8. Relationship to existing epic tasks

Six scheduled tasks currently presume a bridge. Under this RFC each becomes an
implementation of it rather than a parallel invention:

| Task               | Was                                                | Becomes                                                       |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| 17.7               | "SDK `desktop` environment"                        | Subsumed: RFC 0079 task 3.32 + this RFC's transport detection |
| 20.3               | "Mobile SDK native environment and bridge adapter" | The Capacitor transport of `@sovereignfs/bridge`              |
| 17.2 (notify half) | `sdk.device.notify()` sketch                       | The Tauri transport of `notifications.native`                 |
| 17.4               | `sdk.device.secureStore.*` sketch                  | The Tauri transport of `secureStorage`                        |
| 20.5               | Native push (APNs/FCM)                             | A capability registry entry + Capacitor transport             |
| 20.6–20.8          | Photo picker, biometrics, haptics                  | Registry entries + transports; haptics lands in v1 here       |

RFC 0038's inline API sketches (`sdk.device.notify()`,
`sdk.device.secureStore.set/get/delete`) are **superseded** by §6's shapes —
same intent, typed results and negotiation added. Those epic tasks should be
updated when picked up rather than implemented as written.

### Docker / config impact

A new published workspace package: `tsup` build, `turbo.json` pipeline entry,
`transpilePackages` in both `next.config.ts` files, and catalog-pinned dev deps
per the pnpm `catalog:` convention. No new env var, port, on-disk path, or native
dependency in this repository. The shells' native permission declarations live in
their own repositories.

## UI flows

**Capability present:**

```
plugin mounts → handshake resolves → supports('haptics.impact', 1) === true
              → user taps → haptics.impact('light') → { status: 'ok' }
```

**Capability absent (plain browser, or older shell):**

```
plugin mounts → supports(...) === false → affordance not rendered at all
              → (if called anyway) → { status: 'unavailable', capability: … }
```

**Consent, first use:**

```
plugin calls notifications.native.show(...)
  → manifest declares device:notifications ✓
  → no stored grant → platform prompt: "Tally wants to send notifications"
       ├─ Allow → OS prompt → granted → { status: 'ok' }
       ├─ Not now → { status: 'dismissed' }   (may ask again)
       └─ Never  → grant stored as denied → { status: 'denied' } without OS prompt
```

**Undeclared permission:**

```
plugin calls haptics.impact() without device:haptics in its manifest
  → native transport: refused → { status: 'unavailable' }
  → web transport: advisory only — documented as not enforceable
```

## Alternatives considered

- **Extend `SdkHost` with a `device` namespace.** Rejected on a hard
  architectural fact: `SdkHost` is server-side, registered via a Node-process
  global, and no server round-trip can reach a camera or a haptic motor. The
  browser-only-subpath pattern (`@sovereignfs/sdk/offline`) is the only shape that
  works.
- **Let plugins call Capacitor/Tauri APIs directly.** Rejected — already
  forbidden by RFC 0058, and it would couple every plugin to one shell,
  destroying the portability that makes shipping a plugin once possible.
- **Version-based compatibility** (`minShellVersion`, mirroring RFC 0024).
  Rejected: it assumes one party controls both sides' release cadence. Users
  control shell updates and operators control instance updates, so version gates
  would strand working combinations and require coordinated releases across three
  repositories. Capability negotiation removes the need entirely.
- **Duplicate protocol types in each shell repository, spec-only here.**
  Rejected — this is exactly the divergence RFC 0081 rejected separate shell
  repositories over, and protocol drift between two shells is far more expensive
  to discover than a shared dependency is to maintain.
- **Throwing on unavailable/denied.** Rejected — collapses four distinct product
  outcomes into one, and forces every caller into `try/catch` for the entirely
  expected case of "this is a browser".
- **A single broad `device:*` permission.** Rejected — a plugin that wants
  haptics should not thereby be declaring camera access; the whole value of
  install-time metadata is its specificity.
- **Plugin-facing `secureStorage` in v1.** Rejected for now — unsafe while
  client-side plugin identity is self-declared (§5). Revisit only alongside a
  verifiable client identity mechanism.
- **`packages/sdk` taking `@sovereignfs/bridge` as a runtime dependency.** The
  first design considered, and rejected on the facts (§1): the SDK has no
  `dependencies` field at all today and neither does `@sovereignfs/ui`, so
  "zero-deps" is a literal property of both published packages rather than a rule
  about two specific imports. A dependency would also expose the dual-major
  duplication risk and give plugin developers a transitive install for a package
  they should never need to know about. The `provideBridge()` handoff — the same
  pattern `provideHost()` already uses for the same problem — achieves one source
  of truth at no cost.
- **Plugin developers importing `@sovereignfs/bridge` directly** instead of
  `sdk.device.*`. Rejected — `sdk.device.*` is the plugin-facing contract named in
  SRS §3.12, RFC 0058, RFC 0038, and CLAUDE.md, and "bridge" is an implementation
  concept (transports, handshakes) that plugin authors should never have to reason
  about.

## Open questions

1. Does the per-user consent grant belong in the existing data-consent tables
   (RFC 0002's model, surfaced in Account → Data) or its own store? Leaning
   reuse-the-pattern-not-the-table, since the subject is a capability rather than
   a cross-plugin contract.
2. Should `protocolVersion` mismatch be fatal or degrade to `web`? Leaning
   degrade-with-a-recorded-warning, so an old shell never hard-breaks an instance.
3. Where does the "shell too old for this capability" message surface to the
   _user_ — silently absent affordance, or an explicit "update your app" hint?
   Leaning silently absent for v1, since a hint the user cannot act on (auto-update
   disabled, review queue) is worse than no hint.
4. ~~Does the `web` transport belong in `@sovereignfs/bridge` or in
   `@sovereignfs/sdk/device-client`?~~ **Resolved by §1's split:** all three
   transports live in `@sovereignfs/bridge`, since the SDK subpath now holds only
   the contract and must stay dependency-free and implementation-free.
5. Whether a verifiable client-side plugin identity is achievable at all on a
   shared origin, and if so at what cost. It gates plugin-facing `secureStorage`
   and any future capability where cross-plugin isolation matters.
6. Can a Capacitor shell withhold `window.Capacitor` from page scripts while
   still using Capacitor plugins itself (§5)? If not, native permission
   enforcement is advisory on mobile and real only on desktop, and the docs must
   say so. Must be answered in workstream 0003 leg 4, before the enforcement claim
   is relied on.
7. Where does the client bootstrap that calls `provideBridge()` live in the
   runtime, and how is it guaranteed to run before a plugin's first `supports()`
   call? `provideHost()` has `instrumentation.ts` as an unambiguous
   once-before-any-request hook; the client side has no exact equivalent.

## Adoption path

1. **Epic task 3.34** — the contract in `@sovereignfs/sdk/device-client` (types,
   registry, `DeviceResult`, `provideBridge()`, `Symbol.for` storage) plus
   `packages/bridge`'s protocol, `web` transport, and shell-side helper. Published
   as `@sovereignfs/bridge` 0.1.0; `@sovereignfs/sdk` minor bump for the new
   subpath. No plugin-facing capability calls yet.
2. **Epic task 3.35** — `device:*` permissions in the manifest, per-user consent
   grants plus the Account UI, and `@sovereignfs/sdk/device-client`'s
   plugin-facing `haptics`/`nativeNotifications`/`supports` surface with the web
   tier working end to end. `@sovereignfs/sdk` and `@sovereignfs/manifest` minor
   bumps.
3. External: `sovereign-desktop` implements the `tauri` transport (reworking
   tasks 17.2's notify half and 17.4 to this contract).
4. External: `sovereign-mobile` implements the `capacitor` transport (task 20.3,
   rescoped from "bridge adapter" to "the Capacitor transport").
5. Later capabilities land one at a time — registry entry, permission, both
   transports, docs — each with its own privacy and store-review note. Tasks
   20.5–20.8 and 17.2's tray half follow this path.

Sequenced across epics and repositories as
[workstream 0003](../workstreams/0003-device-bridge-across-surfaces.md).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
