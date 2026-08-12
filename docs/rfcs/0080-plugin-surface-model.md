# RFC 0080 — Plugin surface model (`sdk.device.*` and `x-sovereign-surface`)

**Status:** Implemented\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `runtime/middleware.ts` (new `x-sovereign-surface` injected header),
`packages/sdk` (new `device.ts` plus a browser-only `@sovereignfs/sdk/device-client`
subpath — the first implementation of the long-promised `sdk.device.*`),
`packages/manifest` (new optional `surfaces` field), `plugins/launcher`
(availability filtering), `docs/plugin-development.md`,
`docs/architecture-rules.md`. Implements the SDK abstraction tier promised by
RFC 0058 (native mobile shell) and RFC 0038 (desktop shell); prerequisite for
RFC 0082 (focused plugin app shell). Builds on research
[0006](../research/0006-standalone-plugin-apps.md).\
**Incorporated into plan:** Yes — epic tasks 3.32–3.33.

---

## Summary

Give the platform one way to answer "**what surface am I running on?**" and
expose it to plugins as `sdk.device.*` — the API RFC 0058 and RFC 0038 both
promised and neither has shipped.

The signal is **server-injected**: a native shell identifies itself in its
User-Agent, `runtime/middleware.ts` normalizes that into an
`x-sovereign-surface` request header, and plugins read it server-side exactly
as they already read `x-sovereign-user-*`. A second, client-only tier reports
what the server cannot know — whether an ordinary browser is running as an
installed PWA, and which device capabilities are actually present.

A plugin may additionally declare `surfaces: [...]` in its manifest to say
where it is available at all, so Launcher can hide a mobile-only app on
desktop.

**This RFC deliberately does not build a feature-flag system.** Research 0005
separated four concerns that hide under that phrase; this RFC implements the
two that are ambient facts (surface, capability), leaves operator flags to
instance settings if a concrete need ever appears, and rejects rollout flags
outright — Sovereign is single-tenant self-hosted, so there is no fleet to roll
out across.

## Motivation

Features and UI elements increasingly belong to one surface and not another: a
native photo picker only exists in the Capacitor shell, a system-tray affordance
only in Tauri, an "Add to Home Screen" prompt only in a browser that has not
already installed the app, a chrome-less layout only inside a native shell.

Today a plugin has no way to ask. `packages/sdk/src/device.ts` does not exist.
The only related hook, `useIsMobile` in `packages/ui`, answers a **viewport**
question, not a surface one — a desktop browser narrowed to 400px reports the
same as a phone, and a tablet in the Capacitor shell reports the same as a
tablet in Safari.

Worse, the obvious workarounds are both blocked by existing hard rules:

- `NEXT_PUBLIC_SOVEREIGN_SURFACE` cannot work — Next inlines `NEXT_PUBLIC_*` at
  build time and Docker images build without `.env`, so the value freezes to its
  fallback for every deployment.
- Reading `window.Capacitor` or `matchMedia('(display-mode: standalone)')` in a
  `'use client'` component's `useState` initializer or render is forbidden
  (hydration mismatch). Doing it correctly means `useEffect` plus a safe
  default — which means a **visible flash of the wrong UI on every load**,
  acceptable for progressive enhancement and not for gating whole elements.

So the mechanism has to be server-side, and it has to be one mechanism rather
than each plugin inventing its own User-Agent sniffing.

## Current state (what this builds on)

- **`sdk.device.*` is promised but absent.** RFC 0058's device-API strategy
  table and RFC 0038's mirror of it both specify a three-tier model (Web APIs →
  native plugins → `sdk.device.*` abstraction) and both state that plugin
  developers call `sdk.device.*` only. `packages/sdk/src/device.ts` does not
  exist. Epic tasks 17.7 ("SDK `desktop` environment for `sdk.device.*`") and
  20.3 ("Mobile SDK native environment and bridge adapter") are both 📋 —
  they extend a base that was never built. **This RFC builds that base**; 17.7
  and 20.3 become extensions of it rather than parallel inventions.
- **The injected-header pattern is established and is the model to copy.**
  `runtime/middleware.ts:304` verifies the session and injects
  `x-sovereign-user-id`, `-email`, `-role`, `-capabilities`,
  `-session-expires-at`, `-name`, `-image`; `packages/sdk/src/auth.ts:13-34`
  reads them back via `next/headers`. `x-sovereign-plugin-id` is injected the
  same way and consumed by `packages/sdk/src/env.ts` and
  `packages/sdk/src/data.ts:76`. Adding `x-sovereign-surface` is a fifth
  consumer of a proven pattern, not a new mechanism.
- **Shell chrome control already exists and is not being replaced.**
  `shell: 'default' | 'minimal' | 'overlay'` plus `shellConfig.mobileHeader`/
  `mobileFooter` (`packages/manifest/src/schema.ts:160-172`, RFC 0075) are
  build-time composition and per-plugin layout choices. This RFC is orthogonal:
  `shell` says _how this plugin is framed_, `surfaces` says _where it exists_,
  and `sdk.device.*` says _what the current environment supports_.
- **`useIsMobile`** (`packages/ui`, consumed by `DatePicker`, `ContextMenu`,
  `Combobox`, `Menu`, `HoverCard`) stays exactly as it is — a viewport hook.
  This RFC does not change it and does not route it through the surface model.
- **The capability system is deliberately not reused.**
  `runtime/src/capabilities.ts` defines a pure, Edge-resolvable role→capability
  derivation, extended by per-user grants (RFC 0070) with an explicit
  `GRANTABLE_CAPABILITIES` allowlist. Research 0005 rejected folding surfaces
  into it: capabilities answer _authorization_, surfaces answer _availability_,
  and merging them yields checks whose failure is ambiguous between "no
  permission" and "no camera".
- **`sovereign-desktop` already ships** (epic 17.1 ✅) as a Tauri shell loading
  a remote instance, so one of the two native surfaces this RFC describes
  exists in the field today and can be the first real producer of the signal.
- **The service worker's page caches are `NetworkFirst` by hard rule**, because
  pages are per-user SSR and a stale-served document risks replaying one user's
  shell to another (`runtime/next.config.ts`, `CLAUDE.md`). Surface-varying SSR
  interacts with this directly — see "Service-worker interaction" below.

## Proposed design

### 1. Surface taxonomy — two tiers, honestly separated

| Tier           | Value                                  | Knowable server-side? | Source                                   |
| -------------- | -------------------------------------- | --------------------- | ---------------------------------------- |
| **Surface**    | `browser` \| `mobile` \| `desktop`     | **Yes**               | shell User-Agent → middleware            |
| **Installed**  | `true` \| `false`                      | No                    | `display-mode: standalone` (client only) |
| **Capability** | e.g. `camera`, `biometrics`, `haptics` | No                    | native bridge or Web API probe (client)  |

`mobile` means the Capacitor shell (RFC 0058); `desktop` means the Tauri shell
(RFC 0038); `browser` means anything else, including an installed PWA.

**An installed PWA is not its own surface.** It is the same engine hitting the
same origin and it cannot set a header, so `display-mode: standalone` is
irreducibly client-side. Modelling it as a fourth server-side surface value
would be a lie the middleware cannot back up. It is therefore a _refinement_
of `browser`, reported only on the client tier.

### 2. Shell identification — a hint, never a security boundary

Native shells append a token to their WebView User-Agent:

```
Sovereign-Shell/mobile-ios 1.0.0
Sovereign-Shell/mobile-android 1.0.0
Sovereign-Shell/desktop-macos 1.0.0
```

`runtime/middleware.ts` parses it and injects `x-sovereign-surface: mobile |
desktop | browser`, plus an optional `x-sovereign-shell-version` for
compatibility checks. Unrecognized or absent → `browser`. The middleware
**strips any inbound `x-sovereign-surface` header** before injecting its own,
exactly as it must for the `x-sovereign-user-*` family, so a client cannot
forge the value directly.

> **Hard rule, to be added to `docs/architecture-rules.md`:** the surface
> signal is a **presentation hint only**. It derives from a client-controlled
> User-Agent and is trivially spoofable. It must never be an input to
> authorization, entitlement, paywall, or data-access decisions. Anything that
> must not be reachable is gated by session, capability, or plugin permission —
> never by surface. RFC 0082's route lock is a UX and product-scoping
> mechanism, not a security boundary, and says so.

### 3. SDK surface — `sdk.device.*`

**Server tier** (`packages/sdk/src/device.ts`, in the main barrel alongside
`auth`/`env`/`data`, since it reads `next/headers`):

```ts
export type Surface = 'browser' | 'mobile' | 'desktop';

export const device = {
  /** The current request's surface, from the runtime-injected header. */
  async getSurface(): Promise<Surface>,
  /** The native shell's version, or null outside a native shell. */
  async getShellVersion(): Promise<string | null>,
  /** True when running inside any native shell (mobile or desktop). */
  async isNativeShell(): Promise<boolean>,
};
```

`getSurface()` returns `'browser'` when the header is absent — outside a plugin
route context, in a unit test, anywhere. It never throws and has no host
dependency, matching `env.ts`'s "return the safe default" discipline rather
than `data.ts`'s `requireHost()` RPC style.

**Client tier** (`packages/sdk/src/device-client.ts`, exposed on the dedicated
subpath `@sovereignfs/sdk/device-client`):

Following the precedent set by `@sovereignfs/sdk/offline` and the `e2ee-*`
modules — the main barrel transitively reaches server-only `next/headers`, and
Next's client/server boundary check flags the whole reachable module graph, so
a `'use client'` component importing from the barrel fails to build.

```ts
export interface DeviceEnvironment {
  surface: Surface;
  /** Running as an installed PWA (display-mode: standalone). */
  installed: boolean;
}

/** Read the environment on the client. Safe to call only after mount. */
export function readEnvironment(): DeviceEnvironment;

/** Environment as state, initialised to a safe default and filled on mount. */
export function useDeviceEnvironment(): DeviceEnvironment | null;
```

`useDeviceEnvironment()` returns `null` on first render and the real value after
mount — deliberately explicit, so a caller must handle "not known yet" rather
than being handed a plausible-looking default that causes a flash. This is the
hook's whole reason to exist: it makes the hard rule about browser globals in
render impossible to violate by accident.

Capability probes and invocation (`camera`, `biometrics`, `haptics`, …) are
**not** in this RFC. They are designed in
[RFC 0083](0083-device-bridge-capability-contract.md), which adds a third
architectural piece on top of this one: a browser-only bridge with
Capacitor/Tauri/Web transports, capability negotiation at handshake, and typed
results. This RFC answers _where am I_; RFC 0083 answers _what can I do here,
and how do I ask_. Epic tasks 17.7 and 20.3 are subsumed/rescoped by it — see
RFC 0083 §8.

### 4. Manifest — optional `surfaces` declaration

```jsonc
{
  "surfaces": ["mobile", "desktop"],
}
```

Added to `packages/manifest/src/schema.ts` as an optional array of the same
three values, unique, non-empty when present. **Absent means available
everywhere** — today's behavior for every existing plugin, so this is a purely
additive, non-breaking change and `@sovereignfs/manifest` takes a **minor**
bump.

`surfaces` is an **availability** declaration, consumed by the platform:

- Launcher filters its grid to plugins available on the current surface.
- The plugin's sidebar and mobile-drawer entries are filtered the same way.
- Navigating directly to an unavailable plugin's route renders a clear
  "not available on this surface" state rather than a 404 — the plugin _is_
  installed, it just does not belong here, and a 404 would misdescribe that.

Note the deliberate asymmetry with the route lock in RFC 0082: `surfaces`
filters _presentation_ and can be bypassed by anyone who edits their
User-Agent, which is fine because nothing behind it is a secret.

### 5. Service-worker interaction — the part most likely to bite

If a document renders differently per surface and the service worker caches it,
the wrong variant can be replayed to the wrong surface. This is the same class
of bug as the existing hard rule keeping `pages`/`pages-rsc` on `NetworkFirst`
because pages are per-user SSR.

Three acceptable resolutions, in order of preference:

1. **Keep surface-varying differences client-side** wherever the difference is
   cosmetic or additive. Nothing to cache-key; no risk.
2. **Send `Vary: User-Agent`** on documents whose SSR genuinely branches on
   surface. Correct but coarse — it fragments the cache badly, since UA strings
   are near-unique.
3. **Key the SW cache on surface** via a Workbox `cacheKeyWillBeUsed` plugin
   that appends the normalized surface to the cache key. Precise, and the only
   option that keeps caching effective for genuinely surface-varying documents.

The implementation task must pick one **per cache**, not globally, and record
the choice in `docs/architecture-rules.md`. Defaulting to (1) and escalating
only where needed is the recommended posture.

### 6. What this RFC explicitly does not add

- **No operator feature flags.** `PlatformConfig`
  (`packages/sdk/src/types.ts:88-107`) is the right home if a concrete need
  appears; none exists today, and building a Console settings surface nobody
  asked for is the wrong default.
- **No rollout or percentage flags.** Single-tenant self-hosted; no fleet.
- **No capability-system extension.** See "Current state".
- **No change to `useIsMobile`**, `shell`, or `shellConfig`.

### Docker / config impact

None. No new env var, port, on-disk path, or native dependency. The signal
travels on the request.

## UI flows

**Plugin hidden on an unavailable surface:**

```
desktop shell → Launcher renders → surfaces filter applied
              → mobile-only plugin's tile absent, sidebar entry absent
```

**Direct navigation to an unavailable plugin:**

```
desktop shell → GET /scanner → plugin installed but surfaces: ["mobile"]
              → "Not available on this surface" state (not 404)
```

**Surface-gated element inside a plugin, server-rendered:**

```
request → middleware injects x-sovereign-surface: mobile
        → plugin server component: await sdk.device.getSurface() === 'mobile'
        → renders the native photo-picker button, no flash
```

**Install prompt, client-only tier:**

```
browser tab → useDeviceEnvironment() → null on first render (renders nothing)
            → after mount: { surface: 'browser', installed: false }
            → renders "Add to Home Screen" hint
installed PWA → after mount: { installed: true } → hint stays hidden
```

## Alternatives considered

- **Client-only detection** (`window.Capacitor`, `matchMedia`). Rejected as the
  primary mechanism: the hard rule against browser globals in render forces
  `useEffect`, which means a visible flash whenever whole elements are gated.
  Retained for the one tier that genuinely cannot be server-side.
- **`NEXT_PUBLIC_SOVEREIGN_SURFACE`.** Rejected — build-time inlining freezes
  the value; Docker images build without `.env`. Existing hard rule.
- **A cookie carrying `display-mode` so the server can see PWA-ness.** Rejected:
  it is wrong on first load, and it makes SSR vary on a value the SW may have
  cached under a different one — precisely the bug §5 exists to avoid.
- **Extending `runtime/src/capabilities.ts` with surface capabilities.**
  Rejected — authorization/availability category error; see "Current state".
- **A general feature-flag service** with a DB table and targeting rules.
  Rejected as over-engineering for single-tenant self-hosted.
- **Reusing `shell`/`shellConfig` for surface gating.** Rejected — `shell` is a
  build-time composition target and a layout choice, not a runtime environment
  query. Overloading it would make one field answer two unrelated questions.
- **A fourth surface value `pwa`.** Rejected — not server-knowable, so the
  middleware could never populate it honestly. Modelled as the `installed`
  refinement instead.

## Open questions

1. Exact User-Agent token grammar, and whether `sovereign-desktop` (already
   shipped) can adopt it in a patch release or needs a coordinated version.
2. Whether `getShellVersion()` should feed a compatibility gate (shell too old
   for this instance), reusing RFC 0024's machinery, or stay informational.
   Leaning informational until a real incompatibility exists.
3. Whether `surfaces` should also accept `installed` as a pseudo-value for
   "installed PWA only". Leaning no — it would make a server-filtered field
   depend on a client-only fact.
4. Whether the per-cache surface-keying decision (§5) belongs in this RFC or in
   RFC 0082, where the first genuinely surface-varying document appears.

## Adoption path

1. **Epic task 3.32** — middleware normalization + injected header, inbound
   header stripping, `sdk.device.*` server tier, `device-client` subpath with
   `useDeviceEnvironment`, the `architecture-rules.md` hard rule about surface
   never gating authorization, and `docs/plugin-development.md` coverage.
   `@sovereignfs/sdk` minor bump.
2. **Epic task 3.33** — manifest `surfaces` field, Launcher and sidebar/drawer
   filtering, the "not available on this surface" state.
   `@sovereignfs/manifest` minor bump.
3. `sovereign-desktop` adopts the User-Agent token so `desktop` is a real
   producer.
4. Epic tasks 17.7 and 20.3 extend `device-client` with capability probes and
   native bridges, rather than inventing a parallel environment model.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
