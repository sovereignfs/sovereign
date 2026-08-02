# Workstream 0003 — Device bridge across surfaces

**Status:** ⏳ In Progress — legs 1–2 done (in-repo work complete; legs 3–4 are external, in `sovereign-desktop`/`sovereign-mobile`)\
**Date:** July 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0083](../rfcs/0083-device-bridge-capability-contract.md) (device
bridge and capability contract — the governing design),
[0080](../rfcs/0080-plugin-surface-model.md) (surface model — supplies the
`device-client` module and transport detection),
[0058](../rfcs/0058-native-mobile-app-shell.md) /
[0038](../rfcs/0038-desktop-app-shell.md) (the three-tier device strategy this
finally implements)\
**Epics touched:** 3 (Plugins Runtime), 17 (Desktop), 20 (Mobile), plus the
`sovereign-desktop` and `sovereign-mobile` repositories\
**Research:** [0006](../research/0006-standalone-plugin-apps.md)

---

## Goal

The Sovereign platform and plugin runtime serve all three surfaces — PWA (web and
mobile), Tauri desktop, Capacitor mobile — through **one** device-capability
contract. A plugin calls `sdk.device.*`, and the same code reaches a native
capability inside either shell or degrades cleanly to a Web API in a plain
browser, with no plugin-side branching on shell internals.

The contract lives in `@sovereignfs/sdk/device-client` and its implementation ships
as a published `@sovereignfs/bridge`, so the two external shell repositories consume
one protocol rather than converging by accident.

## Definition of done

- [ ] The capability contract (registry, handshake shape, typed results,
      `provideBridge()`) ships in `@sovereignfs/sdk/device-client`, and
      `@sovereignfs/bridge` is published with the transports and protocol.
- [ ] A plugin can call `supports('haptics.impact', 1)` and get a correct answer
      on all three transports.
- [ ] `haptics.impact` and `notifications.native` work end to end on web, Tauri,
      and Capacitor — or report `unavailable` where genuinely absent.
- [ ] `notifications.native`'s web tier routes into the existing Notification
      Center / web push infrastructure rather than paralleling it.
- [ ] `device:haptics` and `device:notifications` exist as manifest permissions,
      with per-user consent grants manageable in the Account plugin.
- [ ] `docs/plugin-development.md` documents the surface **and** states plainly
      that client-side plugin identity is self-declared, so `device:*` is
      review-time metadata and a consent-prompt input, not inter-plugin isolation.
- [ ] The enforcement posture is settled and documented **per transport**: whether
      each shell can withhold its raw bridge object from page JavaScript, and where
      it cannot, that native permissions are advisory there.
- [ ] `packages/sdk` still has no `dependencies` field.
- [ ] An older shell missing a capability, and a newer shell offering an unknown
      one, both behave correctly against an unchanged instance.

## Decisions locked

Settled in a design session with kasunben, July 2026. Full reasoning in
[RFC 0083](../rfcs/0083-device-bridge-capability-contract.md).

| Decision                      | Choice                                                                                                                                           | Rejected alternative, and why                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture                  | Browser-only subpath, no `SdkHost`                                                                                                               | Extending `SdkHost` — it is server-side via a Node global; no server round-trip reaches a camera or haptic motor                                                                                                     |
| Protocol ownership            | Published `@sovereignfs/bridge` from this repo                                                                                                   | Spec-only doc per shell (guarantees drift); types-only package (limits drift to behavior, still diverges)                                                                                                            |
| Contract vs. implementation   | Contract in `@sovereignfs/sdk/device-client`; implementation in `@sovereignfs/bridge`, registered via `provideBridge()` on a `Symbol.for` global | `packages/sdk` taking a runtime dependency on the bridge — the SDK has no `dependencies` field at all today, and a dependency would expose the dual-major duplication risk and give plugin devs a transitive install |
| Compatibility mechanism       | **Capability negotiation at handshake**                                                                                                          | Version comparison / `minShellVersion` — users control shell updates, operators control instances; skew is normal                                                                                                    |
| Result semantics              | Typed `DeviceResult` with `ok`/`unavailable`/`denied`/`dismissed`/`failed`                                                                       | Throwing — collapses four distinct product outcomes and forces `try/catch` for "this is a browser"                                                                                                                   |
| Permission model              | Manifest `device:*` **plus** per-user runtime consent                                                                                            | Runtime consent only (no install-time signal); OS prompts only (no visibility into which app asked)                                                                                                                  |
| Permission granularity        | One permission per capability                                                                                                                    | A broad `device:*` grant — a plugin wanting haptics should not thereby declare camera access                                                                                                                         |
| Shell exposure                | Narrow bridge object only                                                                                                                        | Exposing raw Capacitor/Tauri to page JS — would make native gating aspirational rather than real                                                                                                                     |
| v1 capability set             | `haptics.impact`, `notifications.native`, platform-only `secureStorage`                                                                          | Full RFC 0058+0038 list — each capability carries its own permission, privacy, and store-review surface                                                                                                              |
| Plugin-facing `secureStorage` | **Not in v1**                                                                                                                                    | Exposing it now — client-side plugin identity is self-declared, so any plugin's client code could read another's entries                                                                                             |
| Plugin identity client-side   | Documented as **self-declared and unverifiable**                                                                                                 | Implying enforcement — same honesty posture as RFC 0078 §6 and RFC 0080 §2                                                                                                                                           |

## Prerequisites

| Prerequisite                                          | Owner           | Status                         |
| ----------------------------------------------------- | --------------- | ------------------------------ |
| Task 3.32 — `device-client` subpath exists (RFC 0080) | epic 3          | ✅ — leg 2 can proceed         |
| `sovereign-desktop` repo (shipped, epic 17.1)         | external        | ✅ — leg 3 can proceed         |
| `sovereign-mobile` repo (epic 20.1)                   | workstream 0002 | ⏳ — in progress, blocks leg 4 |

Leg 1 depends on none of these.

> Task 3.32 creates the `device-client` subpath as part of RFC 0080's surface
> model; leg 1 extends that same subpath with the capability contract. If leg 1
> starts first, it creates the subpath and 3.32 adds to it — either order works,
> but they must not both create it.

## Legs

| Leg | Name                                  | Epic tasks            | Repo                | Gate? | Done when                                                  |
| --- | ------------------------------------- | --------------------- | ------------------- | ----- | ---------------------------------------------------------- |
| 1   | Capability contract + bridge web tier | 3.34 ✅               | this repo           | No    | Contract fixed; web transport works; no plugin surface yet |
| 2   | Plugin surface, permissions, consent  | 3.35 ✅               | this repo           | No    | Plugins call `sdk.device.*`; consent manageable in Account |
| 3   | Tauri transport                       | 17.2, 17.4 (rescoped) | `sovereign-desktop` | No    | Both v1 capabilities work in the desktop shell             |
| 4   | Capacitor transport                   | 20.3 (rescoped)       | `sovereign-mobile`  | No    | Both v1 capabilities work in the mobile shell              |

**Cross-repo parallelism** applies as in workstream 0002: the leg contract's
merge-before-next rule is per repository, so legs 3 and 4 may proceed in parallel
with each other and with in-repo work, once leg 1's published protocol is
available to depend on.

## Leg detail

### Leg 1 — Capability contract and `@sovereignfs/bridge` web tier

**Epic task:** 3.34

**Why this leg is first and has no plugin-facing surface:** fixing the contract
before any consumer exists means both shells and the SDK can be built against it.
Shipping a plugin API in the same leg would invite designing the protocol around
one capability's convenience.

**Technical notes:**

- **The contract goes in `@sovereignfs/sdk/device-client`; the implementation goes
  in `@sovereignfs/bridge`, registered via `provideBridge()`** — the same handoff
  `provideHost()` already uses for the same problem (the SDK needing to call
  something it must not depend on). `packages/sdk` has **no `dependencies` field
  today and must not gain one.**
- **`provideBridge()` must store on a `Symbol.for`-keyed global**, not a
  module-level variable. `packages/sdk/src/host.ts` documents the first reason
  (Next compiles separate bundles per entry; dev HMR resets module state); the
  second is specific here — a plugin could install a different major of
  `@sovereignfs/bridge` than the platform ships, giving two copies with two
  handshake states, one of which never resolves.
- `@sovereignfs/bridge` takes `@sovereignfs/sdk` as a **`devDependency` only** —
  types erase at build, so the published output has no runtime dependency and the
  contract still has one source of truth.
- Zero runtime dependencies in both. No React, no Next, no Node built-ins — the
  bridge must run in a Capacitor shell, a Tauri shell, and a browser page. Never
  import `next/headers`, `@sovereignfs/db`, or anything reachable from `SdkHost`;
  verify by type-checking standalone.
- Two bridge entry points: `@sovereignfs/bridge` (page side, consumed by `runtime`)
  and `@sovereignfs/bridge/shell` (shell side), so neither pulls the other's code.
- New published workspace package: `tsup` build, `turbo.json` pipeline entry,
  `transpilePackages` in **both** `next.config.ts` files, catalog-pinned dev deps
  per the pnpm `catalog:` convention.
- Capability versions are integers incremented on a breaking payload change; a
  shell may advertise two versions of one capability during a migration.
- Resolve RFC 0083 open question 7 — where the runtime's client bootstrap calls
  `provideBridge()`, and how it is guaranteed to run before a plugin's first
  `supports()` call. `provideHost()` has `instrumentation.ts` as an unambiguous
  once-before-any-request hook; the client side has no exact equivalent, so this
  needs deciding rather than assuming.
- Resolve open question 2 (protocol-version mismatch fatal vs. degrade-to-`web`).
  Recommended: degrade with a recorded warning, so an old shell never hard-breaks
  an instance.

**Do not proceed if:** `packages/sdk` would need a `dependencies` entry to make
this work. That is the signal the contract/implementation split has been drawn in
the wrong place — reopen RFC 0083 §1 rather than taking the dependency.

**Outcome (2026-08, all verified — not assumed):**

- **The contract landed on a new `@sovereignfs/sdk/device-bridge` subpath, not
  `device-client` as written above.** `device-client.ts` (RFC 0080's
  `useDeviceEnvironment`) imports React; `@sovereignfs/bridge` needs
  `provideBridge` as a genuine runtime value, and React ships no
  `"sideEffects": false` in its own `package.json`, so a bundler inlining the
  contract (required, since the SDK is a devDependency-only relationship)
  cannot tree-shake an unused React import out of a shared file. Confirmed
  empirically by actually building `@sovereignfs/bridge` with `tsup` and
  inspecting the output: co-located, `dist/index.js` was 64KB and contained a
  full copy of React; split into `device-bridge.ts`, it dropped to 1.46KB with
  zero `react` references. Leg 2's plugin-facing surface still lands in
  `device-client.ts` as designed — plugin React components already depend on
  React, so it carries none of this risk.
  - **Prerequisites table above still says `device-client` — read it as
    `device-bridge` for leg 1's contribution.** Leg 2 does create/extend
    `device-client.ts` itself (its own plugin-facing `supports()` etc.), so
    the "either order works" note still holds for that subpath; it just isn't
    the one leg 1 touched.
- **Open question 2 resolved as recommended**: a native shell whose
  `protocolVersion` doesn't match this build's degrades to the `web`
  transport (empty capabilities) with a `console.warn`, never a fatal error.
- **Open question 7 resolved**: a module-level call to `installWebBridge()` at
  the top of `runtime/app/(platform)/_components/ClientShell.tsx` — the
  platform layout's single client-side entry point, rendered around every
  authenticated route. Runs once as soon as that chunk is evaluated.
- **A gap in RFC 0083's `BridgeHandshake.shell.platform` enum found and
  fixed**: the original `'ios' | 'android' | 'macos' | 'windows' | 'linux'`
  union has no value for "no native shell present", which the web transport's
  own handshake must still return honestly. Extended with `'web'`.
- `transpilePackages` added to `runtime/next.config.ts` only, not
  `apps/auth/next.config.ts` — confirmed by grep that `apps/auth` doesn't
  import `@sovereignfs/sdk` at all today, so it has no reason to import the
  bridge either. No `turbo.json` pipeline entry needed — `build`/`typecheck`
  already run generically via each package's own scripts.
- Verified via `packages/bridge/src/__tests__/*.test.ts`,
  `packages/sdk/src/__tests__/device-bridge.test.ts`, and — since the
  consuming route (`ClientShell`) needs an authenticated session this
  environment has no credentials for — a real `pnpm --filter
@sovereignfs/runtime build` (production build, not just typecheck) producing
  every route including `/launcher` with no error.

### Leg 2 — Plugin surface, permissions, and consent

**Epic task:** 3.35

**Depends on:** leg 1, and task 3.32 for the `device-client` subpath.

**Technical notes:**

- The plugin surface goes on `@sovereignfs/sdk/device-client` — the browser-only
  subpath, for the reason `@sovereignfs/sdk/offline` already documents: the main
  barrel transitively reaches server-only `next/headers`, and Next's boundary
  check flags the whole reachable module graph.
- `supports()` returns `false` before the handshake resolves, deliberately.
  Capabilities are progressive enhancement; a component must render a working
  state without them. Do not soften this into a promise-that-blocks-render.
- `device:haptics` and `device:notifications` join `permissionSchema`. Additive —
  `@sovereignfs/manifest` minor bump.
- `notifications.native`'s web tier must route into the shipped Notification
  Center / web push path (RFC 0015/0016, broker per RFC 0034), not a second
  notification mechanism.
- Consent grants follow the cross-plugin consent _pattern_ (Account → Data), and
  resolve open question 1 on whether they reuse those tables or get their own.
- **Write the enforcement limits into `docs/plugin-development.md` in plain
  words**, not as a footnote: client-side plugin identity is self-declared, so
  `device:*` is install/review-time metadata and a consent-prompt input, and it
  provides no isolation between plugins. Same posture as `offline:write`.
- `@sovereignfs/sdk` minor bump; NFR-04 applies — no breaking change in a patch,
  and the registry must grow additively.

**Do not proceed if:** the consent prompt cannot name the requesting app
truthfully. A prompt saying "Tally wants to send notifications" when the identity
is unverifiable is a misleading prompt — either the copy acknowledges the limit or
the prompt is instance-scoped rather than plugin-scoped.

**Outcome (2026-08, all verified — not assumed):**

- **This "do not proceed if" gate is satisfied by not building the
  platform-rendered prompt at all, by explicit developer decision** (asked
  directly mid-implementation, since the RFC's UI flow implies a real new
  global overlay primitive — comparable in size to leg 1 on its own —
  and simpler alternatives existed). `requestPermission(pluginId)` records
  the consent grant and calls the browser's native
  `Notification.requestPermission()` directly; the calling plugin's own UI
  (e.g. an "Enable notifications" button, rendered while the user is already
  inside that plugin) is what supplies the naming context. No misleading
  prompt is rendered because no platform-rendered prompt exists in v1 — the
  standard web pattern, not a corner cut silently. A platform-rendered
  prompt remains a reasonable future enhancement if this proves insufficient.
- **Resolved open question 1**: a new `device_consent_grants` table, not the
  RFC 0002 `consent_grants` table — compound-keyed `(user_id, plugin_id,
capability)`, hard delete on revoke, mirroring `user_capability_grants`'s
  shape rather than `consent_grants`'s (which is keyed by consumer/provider/
  contract/version — the wrong shape for "a capability granted to a plugin").
- **`nativeNotifications.show()`'s web tier is the Web Notifications API
  directly** (`new Notification(...)`), not the push/broker pipeline (RFC
  0015/0016/0034) as this leg's own task description originally said. That
  pipeline exists to reach a closed tab; `.show()` is the immediate,
  foreground capability RFC 0083 §7's own table describes per transport
  ("Local notification" / "OS notification" / "Web Notifications" — three
  _immediate_ mechanisms). `requestPermission()` does reuse the existing
  `Notification.requestPermission()` flow already shipped in the Account
  plugin's notifications page — no second permission/subscription mechanism,
  which is the part of "route into the correct tier" that actually mattered.
- `haptics.impact()` needed no consent/permission machinery at all — RFC
  0083 §7 chose it first specifically because it needs none.
- Verified via `packages/sdk/src/__tests__/device-client.test.ts` (17 new
  tests), `packages/db/src/__tests__/platform-db.test.ts`'s new grant-helper
  block, and — since `runtime/tsconfig.json` excludes composed plugin routes
  from its own typecheck scope entirely — a real `pnpm --filter
@sovereignfs/runtime build` confirming the new Account UI section and API
  route actually compile, plus a live dev-server check that the new route
  session-gates identically to its `data-grants` sibling.

### Leg 3 — Tauri transport (`sovereign-desktop`)

**Epic tasks:** 17.2 (notification half) and 17.4, both **rescoped** — see
RFC 0083 §8. Do not implement them as currently written; their inline
`sdk.device.notify()` / `sdk.device.secureStore.*` sketches are superseded.

**Technical notes:**

- Implement `notifications.native` via the Tauri notification plugin and
  `secureStorage` via the keychain plugin, both behind the bridge.
- **Expose only the narrow bridge object.** No raw `window.__TAURI__` reaching
  page JavaScript — this is what makes native capability gating real.
- `secureStorage` is platform-internal in v1; its first consumer is RFC 0082 §5's
  durable-session sequel, not plugins.
- The shell's `capabilities` list must reflect what this build actually supports —
  advertising a capability the transport does not implement is worse than omitting
  it, because the caller's `unavailable` path never runs.
- 17.2's system-tray half is unrelated to the bridge and can stay as specified.

**Do not proceed if:** the desktop shell would have to advertise a capability it
cannot honor to make a test pass.

### Leg 4 — Capacitor transport (`sovereign-mobile`)

**Epic task:** 20.3, rescoped from "Mobile SDK native environment and bridge
adapter" to "the Capacitor transport of `@sovereignfs/bridge`". The
environment-detection half of that task is already covered by RFC 0080's 3.32.

**Depends on:** `sovereign-mobile` existing — workstream 0002 leg 4 (task 20.1).

**Technical notes:**

- **Answer RFC 0083 open question 6 here, before relying on the enforcement
  claim.** Capacitor injects its own runtime into the WebView by design, and page
  JavaScript is the intended caller of `Capacitor.Plugins.*` — so "expose only the
  narrow bridge" may be materially harder than on Tauri, whose command surface is
  opt-in. If the shell cannot withhold `window.Capacitor` from page scripts while
  using Capacitor plugins itself, native permissions are **advisory on this
  transport** and the docs must say so per transport rather than in general.
- Otherwise the same requirements as leg 3: narrow bridge only, honest
  `capabilities` advertisement.
- `haptics.impact` maps to the Capacitor haptics plugin; `notifications.native`
  to local notifications. Native _push_ (APNs/FCM) is task 20.5 and explicitly
  **not** in this workstream — it is a later registry entry.
- Each native permission added to the app requires a store privacy declaration;
  keep the v1 slice's permission footprint minimal, which is part of why haptics
  and local notifications were chosen.

**Do not proceed if:** adding a v1 capability would require a new store privacy
declaration that has not been reviewed — that is a signal the capability belongs
in a later, dedicated task.

## Risks

- **Client-side plugin identity is unverifiable**, and it constrains the design
  permanently, not just in v1. Any future capability where cross-plugin isolation
  matters is blocked on solving it (RFC 0083 open question 5). The mitigation for
  now is scope: keep such capabilities platform-internal.
- **Advertising drift** — a shell that claims a capability it cannot honor turns a
  handled `unavailable` path into a runtime failure. Both shell legs carry a
  review-checklist item for this.
- **Three-repository coordination.** The negotiation design removes the _need_ for
  coordinated releases, but it does not remove the need for the protocol to be
  right early: a breaking protocol change after both shells ship costs two store
  review cycles. This is the argument for the thin v1 slice.
- **NFR-04 on two published packages.** `@sovereignfs/bridge` and
  `@sovereignfs/sdk` both become public contracts here. A capability registry that
  needs a breaking change is expensive; design for additive growth from the first
  commit.
- **Store review latency applies to every capability**, not just the first. Each
  later capability lands in both shells and waits on two review queues — reinforcing
  that capabilities should ship one at a time with their own privacy note.

## Kill criteria

**If the contract/implementation split cannot hold** — i.e. `packages/sdk` would
need a runtime dependency to make `provideBridge()` work: stop before leg 1 and
revisit the boundary in RFC 0083 §1. Duplicated protocol types across three
repositories is not an acceptable fallback; a types-only package is the next option
to evaluate, and taking the SDK dependency is the last.

**If negotiation proves insufficient in practice** (e.g. a capability needs
coordinated release anyway): stop after leg 2 and reopen RFC 0083's compatibility
section before either shell implements a transport. The web tier alone still
delivers a working `sdk.device.*` for browser and PWA surfaces.

**If a shell cannot avoid exposing its raw bridge object** — most likely on
Capacitor, which injects its runtime into the WebView by design and expects page
JS to call `Capacitor.Plugins.*`: ship the contract with native permissions
documented as **advisory on that transport** rather than enforced, and say so per
transport rather than in general. Portability, negotiation, and typed results are
unaffected; only the enforcement claim weakens, and RFC 0083 §5 already states it
carefully enough to amend without rewriting the design.

## Relationship to other workstreams

|                   | 0003 (this)                        | 0002 (native app release)     | 0001 (standalone plugin apps) |
| ----------------- | ---------------------------------- | ----------------------------- | ----------------------------- |
| Ships             | A device capability contract       | The whole-instance native app | Per-plugin PWA + focused apps |
| Needs from others | 3.32; `sovereign-mobile` for leg 4 | —                             | 3.32                          |
| Blocks            | Nothing in 0001/0002               | 0003's leg 4                  | —                             |

None of the three is a prerequisite for another's core value. 0002 ships an app
without any device capabilities; 0003 ships capabilities that work in a browser
before either shell implements a transport.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
