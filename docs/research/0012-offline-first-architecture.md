# Research 0012 — Offline-first architecture

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Scope:** `runtime` (middleware, service worker, shell), `packages/sdk`,
`packages/manifest`, `packages/bridge`, `apps/auth`, `plugins/launcher`,
`sovereign-mobile` / `sovereign-desktop` (external repos)\
**Related:** supersedes research
[0009](0009-offline-database-architecture.md); corrects a finding in research
[0008](0008-wkwebview-android-webview-offline-spike.md); revisits RFC
[0074](../rfcs/0074-offline-capable-plugins.md) and RFC
[0078](../rfcs/0078-offline-plugin-writes.md) (both shipped, both proposed for
replacement here); interacts with RFC
[0071](../rfcs/0071-sqlite-at-rest-encryption.md) (key management), RFC
[0080](../rfcs/0080-plugin-surface-model.md) (surface model), RFC
[0082](../rfcs/0082-focused-plugin-app-shell.md) §4 (offline assumptions), RFC
[0083](../rfcs/0083-device-bridge-capability-contract.md) (device bridge)

---

## Question

Sovereign's offline support today is **online-first with offline as a
fallback**: the platform is a network application that degrades when the
network drops. The proposal driving this research is to invert that into an
**offline-first** architecture, where the device holds a real copy of the data
and the network is what makes it fresh.

The concrete questions:

1. Can the platform shell, launcher, and login flow cold-start with no network?
2. Can plugins declare graduated levels of offline capability rather than the
   current single on/off flag?
3. Where does offline data actually live, per surface — and is it durable?
4. Is offline data encrypted at rest, and who holds the key?
5. What does this cost, and what blocks it?

This matters more than a normal feature question: unreliable offline support
contradicts the sovereignty premise the project is built on. A self-hosted
workspace whose apps stop working when the user's connection does is not
meaningfully under the user's control.

## Findings

### Offline is unreliable today for three independent reasons

Two of these were unknown before this session. All three must be fixed; fixing
any one alone changes nothing.

#### 1. The service worker never installs for a logged-out visitor

`runtime/middleware.ts:602` gates every path except an explicit allowlist. That
allowlist covers `sw.js`, `workbox-`, and `fallback-` — but **not `worker-`**:

```
'/((?!login|…|manifest.json|sw.js|workbox-|fallback-|icons/|_next/static|…).*)'
```

`worker-<hash>.js` is `@ducanh2912/next-pwa`'s `customWorkerSrc` output, built
from `runtime/worker/index.ts` (the Web Push handler added by RFC 0016). It was
introduced after this allowlist was written and never added to it. The comment
directly above the matcher — "Workbox/fallback bundles… must load without a
session" — shows the intent was to exempt every service-worker artifact.

Verified against production:

```
$ curl -sS -o /dev/null -D - https://sovereign.openfs.io/worker-fcda3e92b7d22339.js
HTTP/2 303
location: /login?returnUrl=%2Fworker-fcda3e92b7d22339.js

$ curl -sS -o /dev/null -D - https://sovereign.openfs.io/fallback-ce627215c0e4a9af.js
HTTP/2 200
```

The generated `sw.js` contains:

```js
importScripts('/fallback-ce627215c0e4a9af.js', '/worker-fcda3e92b7d22339.js');
```

A redirected `importScripts()` inside a service worker must fail, per spec. So
**the entire service-worker install fails** — not just push — for any request
without a valid session cookie. A visitor who has never signed in never gets a
service worker, so the login page is never precached, so cold-start offline is
structurally impossible today.

**This corrects research 0008.** That doc recorded the same error from
`adb logcat` and concluded: "This is Android-WebView-specific, not a server
bug," on the strength of a desktop-Chromium control test showing
`active: true`. The comparison was confounded by authentication state — service
worker scripts are fetched with same-origin credentials, so an
already-authenticated browser receives 200 and installs cleanly, while a cold
WebView receives the 303. Plain `curl` reproduces it on any platform. The
finding was real; the attribution was wrong, and the root cause has been in the
platform's own middleware the whole time.

Fix is one token in the allowlist. Tracked separately from this research.

#### 2. The offline session assertion expires after five minutes

`apps/auth/src/auth.ts:56`:

```ts
cookieCache: { enabled: true, maxAge: 300 },
```

Middleware verifies sessions offline via better-auth's signed cookie cache
(HMAC, no network round-trip). After 300 seconds it falls back to a network
`GET /api/verify`, which fails with no connection. So even with a perfect
service worker, offline access dies five minutes after the last online request.

The 300s value is correct for its actual purpose — it bounds how stale a role
change or deactivation can be. It is simply not an offline-session mechanism,
and was never intended as one. Offline-first needs a **separate, longer-lived,
explicitly-scoped offline session assertion**.

#### 3. There is no durable or encrypted local storage

`packages/sdk/src/offline.ts` (331 lines) and
`packages/sdk/src/offline-queue.ts` (388 lines) both store plaintext in
IndexedDB. IndexedDB is **evictable** on every platform — WebKit's storage
policy deletes script-created data after seven days without interaction for
non-installed origins, and any origin's data can be evicted under storage
pressure. For a read cache that is a slow cold start; for the RFC 0078 write
queue it is silent data loss, which RFC 0078 §7 already names as a concern and
RFC 0082 §4 restates for the native shell without mitigating it.

Nothing anywhere in the current offline surface encrypts local data.

### Cold-start offline requires caching an authenticated document

This collides head-on with a hard architectural rule at
`docs/architecture-rules.md:344-354`:

> **Never switch the service worker's document/page cache entries (`pages`,
> `pages-rsc`, `pages-rsc-prefetch`) to a stale-serving strategy**
> (`StaleWhileRevalidate`/`CacheFirst`). Sovereign's pages are per-user SSR
> (nav, plugin list, account state) — replaying a cached rendered shell risks
> showing a stale or different user's authenticated content after logout/login
> on a shared device.

The rule is sound and was written before anyone proposed offline-first. But
there is no way to satisfy requirement 1 without violating it as currently
worded, because there is no other mechanism that can serve a document with no
network.

**Next.js's own offline support does not close this gap.** Next.js 16.3 ships
`experimental.useOffline`, which keeps failed navigations and Server Actions
pending and retries them on reconnect. Its documentation is explicit about the
limit:

> "This feature only applies to soft navigations into prefetched routes and
> Server Action calls from the current page. A full page reload while offline
> still fails because the browser needs the network to deliver the HTML; full
> offline loads would need a service worker."

Cold-starting the app offline **is** a full page load. So the service worker
remains mandatory and the rule has to be revised rather than routed around.

(Sovereign is on Next.js `^15.5.22` per the `pnpm-workspace.yaml` catalog, so
`useOffline` is not available today regardless. It is worth adopting later for
a different reason: it detects "connected to Wi-Fi with no upstream internet,"
which `navigator.onLine` — what `OfflineBanner.tsx` uses — cannot.)

### The delivery model is the deeper constraint

Sovereign's native shells load the **remote instance URL** into a WebView
(`sovereign-mobile` ADR 0005: bundled boot page, then `location.assign()` to
the instance). Every route and every pixel arrives from the server at runtime.

That is the right choice for a plugin platform — a third-party plugin's UI
cannot be compiled into a binary built before that plugin existed — but it
means **all offline reliability rests on the service worker**, a single point
of failure that is currently broken (finding 1).

Every self-hosted peer that achieves reliable offline uses the opposite model:

| App                     | Model                                  | Offline result    |
| ----------------------- | -------------------------------------- | ----------------- |
| Bitwarden / Vaultwarden | Native client, local encrypted DB, API | Reliable          |
| Nextcloud               | Native client, local file cache        | Reliable          |
| Immich                  | Native client, local DB + local media  | Reliable          |
| **Sovereign (today)**   | **WebView loads the server's HTML**    | **SW-contingent** |

A tempting middle path — bundle a minimal boot shell locally so launch never
needs the network — runs into origin isolation: `capacitor://` and
`https://instance` are **different origins with separate storage partitions**.
A bundled page cannot read data written by the remote-origin app. So a bundled
shell can launch and display something, but cannot show cached plugin data.
This constrains tier 3 specifically (see Recommendation).

Research 0008 confirmed the platform divergence underneath this: on iOS the
bundled `capacitor://` scheme exposes **no `navigator.serviceWorker` at all**,
while Android's default bundled scheme is `https://localhost` and service
workers register fine. IndexedDB works in every context tested, on both
platforms, bundled and remote alike.

### Storage: what is actually viable in 2026

| Option                                       | Availability                         | Durable?                             | Encryption            |
| -------------------------------------------- | ------------------------------------ | ------------------------------------ | --------------------- |
| **IndexedDB**                                | Everywhere, incl. iOS `capacitor://` | No — evictable                       | None built-in         |
| **OPFS + SQLite WASM** (`OPFSCoopSyncVFS`)   | Chrome 108+, Safari 16.4+, FF 111+   | No — evictable                       | None built-in         |
| **Native SQLite** (Capacitor)                | iOS / Android                        | **Yes — app sandbox, not evictable** | **SQLCipher AES-256** |
| **Native SQLite** (Tauri `tauri-plugin-sql`) | All desktop + mobile, via SQLx       | **Yes — native filesystem**          | Via SQLCipher         |

Two consequences:

- **`OPFSCoopSyncVFS` (wa-sqlite) is the 2026 production pick for the web**, and
  notably does **not** require COOP/COEP headers — the official `sqlite-wasm`
  OPFS build does, which would fight Sovereign's CSP and Docker-served headers.
  Caveats: no OPFS in Safari private browsing; ~1 MB WASM payload.
- **Native storage is the entire justification for a device-only tier.** Not
  "mobile is special" — iOS `WKWebsiteDataStore` eviction makes web storage
  unsuitable for a wallet, and the app sandbox is the only place that survives.
  This means the correct gate is **capability detection** ("is a durable,
  encrypted store available?"), not `sdk.device.getSurface()` — which
  `docs/sdk-stability.md:65` explicitly documents as a presentation hint,
  never a security boundary, and which is trivially spoofable.

### Sync engines: mostly not applicable

Research 0009 rejected PowerSync. The current landscape rules out more:

- **PowerSync** — service is **FSL-licensed** (source-available, not OSI open
  source), requires a separate Docker service, Postgres-oriented. Fails the
  open-source positioning and the SQLite default.
- **ElectricSQL** — the post-2024 rebuild is **Postgres-only and read-path
  only**; writes go through your own API. Sovereign defaults to SQLite.
- **Zero** — offline is **explicitly out of scope**, per its own authors at the
  2025 Local-First Conference.
- **RxDB** — the one genuine build-vs-buy candidate: IndexedDB/OPFS/SQLite
  backends, field-level encryption, backend-agnostic replication.
- **CRDTs (Yjs, Automerge, Loro)** — Yjs is the production default. But CRDTs
  solve _concurrent multi-writer editing_. Sovereign is single-tenant with
  predominantly single-writer-per-record data; RFC 0078's existing last-write-
  wins timestamps are likely sufficient. Recommend deciding against explicitly
  rather than leaving it open.

### Passkeys are already deployed, and PRF is now usable

`apps/auth/src/auth.ts:231` configures better-auth's `passkey()` plugin with
`rpID` / `rpName` / `origin`. WebAuthn is live in the platform today.

The **WebAuthn PRF extension** derives a stable symmetric key from a passkey —
biometric-gated, hardware-backed, **in the browser**. Supported on iOS 18 /
Safari 18+ and Chrome / Android. Caveat: Apple does not pass PRF to external
roaming authenticators on iOS, but platform passkeys (Face ID, iCloud
Keychain) work, which is the case that matters here.

This substantially closes what would otherwise be a native-only capability gap:
mobile-web PWA can have the same key custody as the native shell, reusing
infrastructure already deployed.

### The manifest field has already changed shape twice

RFC 0074 shipped `offline` as an object (`{ routes[], root }`); RFC 0078
deliberately flattened it to `offline: z.boolean()`
(`packages/manifest/src/schema.ts:228`) with an `offline:write` permission
(`:36`) and a cross-field refine tying them together (`:637`). Any further
change is a third breaking manifest change and needs a `docs/upgrade.md`
migration note, as the RFC 0078 flattening did.

Current device permissions are only `device:haptics` and
`device:notifications` (`packages/manifest/src/schema.ts:37-38`) — there is no
secure-storage capability in the bridge contract yet.

### Documentation drift found along the way

- `docs/rfcs/README.md` lists RFC 0074 as "Partially implemented" and RFC 0078
  as "Draft"; both RFC headers say "Implemented" and `ROADMAP.md:178,186` mark
  both ✅.
- `docs/sovereign-proposal-plan-srs.md:700` (§3.11) still states "Plugin data is
  not cached offline in v1," which RFC 0074/0078 contradict.
- RFC 0074 §6's changelog claims `middleware.ts` flags `/` with
  `x-sovereign-offline-route` unconditionally; the current code at
  `runtime/middleware.ts:544-558` explicitly does not, with a comment
  explaining the revert. Git history shows this flip-flopped four times.
- RFC 0082 §4 asserts offline is "entirely the web stack… nothing about offline
  is native-specific, and that is the payoff." A device-only tier backed by
  native SQLite contradicts this directly.

## Options considered

### A. Harden the current model (online-first, better caching)

Fix the three bugs, keep the boolean manifest flag, keep IndexedDB, keep the
architecture rule intact by never caching authenticated documents.

Cheapest by far, and fixing bug 1 alone would materially improve today's
experience. But it cannot deliver cold-start offline (the rule forbids the only
mechanism that could), cannot deliver durable storage, and cannot deliver a
device-only tier. It is a worthwhile **interim** step, not an answer.

### B. Offline-first with a single tier

Make every plugin offline-capable by default with one uniform mechanism.

Rejected: most plugins genuinely do not need it (Console and Settings are
administrative and should arguably _not_ work offline), the storage and
encryption cost is real, and forcing it on every plugin author is hostile.
Default-closed is also consistent with how the platform already treats
permissions and visibility.

### C. Offline-first with three graduated tiers — **recommended**

Detailed in Recommendation below.

### D. Adopt an off-the-shelf sync engine

Rejected on licensing (PowerSync FSL), dialect fit (ElectricSQL Postgres-only),
or scope (Zero excludes offline). RxDB remains a credible dependency for tier 2
sync internals if building it proves larger than expected — worth keeping as a
fallback rather than a commitment.

### E. Fat-client native apps for sensitive plugins

Ship tier-3 plugins as real native clients with bundled UI and a local DB,
talking to the instance over an API only when the user opts into sync.

This is what Bitwarden and Nextcloud do and it is the only model with a proven
offline reliability record. It is also incompatible with the plugin system's
core premise (server-delivered third-party UI) and would require app-store
releases per plugin. Not recommended as the general model — but the origin-
isolation constraint above means something close to it may be forced for tier 3
specifically. This is the largest genuinely open design question.

## Recommendation

### Three tiers, defined by capability rather than platform

| Tier                | Data's home                    | Works offline | Available on                 | Key custody                  |
| ------------------- | ------------------------------ | ------------- | ---------------------------- | ---------------------------- |
| **(none, default)** | Server                         | No            | Everywhere                   | n/a                          |
| **`offline-first`** | Server, full replica on device | Yes           | Everywhere                   | Device key, unlocks silently |
| **`device-only`**   | **Device. No server copy.**    | Yes           | Where durable storage exists | **Device auth required**     |

Manifest surface:

```ts
offline: z.enum(['offline-first', 'device-only']).optional();
```

Three deliberate choices:

- **No explicit "off" value.** Omitting the field already means no offline
  support, consistent with how the platform treats every other default-closed
  declaration. A third literal for "off" reintroduces exactly the
  boolean-vs-enum ambiguity that motivated RFC 0078's flattening.
- **`device-only`, not `offline-only`.** `manifest.offline === 'offline'` reads
  badly, and "device-only" states the actual constraint (data never leaves the
  device) rather than restating the field name.
- **Drop `offline:write`.** Both tiers imply local mutation, so the enum is
  sufficient signal for Console's install-review UI. This also resolves RFC
  0074's still-open question 1 ("should offline require a distinct permission
  for install-review visibility?") for free.

**Define tier 3 by capability, not surface.** A `device-only` plugin requires a
durable, encrypted, device-auth-gated store. Today only native shells provide
one — so today it is phone-only. But when Tauri desktop lands, or if OPFS plus
`navigator.storage.persist()` plus PRF becomes good enough, the same plugin
should light up there with **no manifest change**. Gating on
`sdk.device.getSurface()` would both bake in today's limitation and misuse a
field documented as never being a security boundary.

### Encrypt at rest in both tiers; vary only the key custody

| Tier            | Key lives in                                                            | Unlock          |
| --------------- | ----------------------------------------------------------------------- | --------------- |
| `offline-first` | Keychain/Keystore without user-presence, or non-extractable `CryptoKey` | Silent          |
| `device-only`   | Keychain/Keystore with user-presence, or WebAuthn PRF                   | **Device auth** |

Encrypting tier 2 costs nothing in UX and means "plaintext on disk" is never
the answer anywhere. The tiers then differ by _what guards the key_, not by
whether encryption exists — a much cleaner story for plugin authors, who would
otherwise reasonably assume tier-2 offline data is protected because tier-3's
is.

### Device auth as key custody, not as a UI gate

The distinction is load-bearing:

- **UI gate** — app prompts for Face ID, JS sets `unlocked = true`, renders.
  An attacker with the device reads plaintext IndexedDB and never runs the
  app's JavaScript. This is theater.
- **Key custody** — the key lives in Keychain/Keystore (or is PRF-derived) and
  the OS releases it only after successful device auth. Data on disk is
  ciphertext. Without the auth there is nothing to read.

Only the second is worth building. It also means **enrollment is structural,
not a preference**: enabling a `device-only` plugin _is_ the enrollment, and
there is no configuration in which the plugin works without it. Nothing to
enforce, no settings toggle to drift out of sync, and the launcher's own gate
can stay advisory because the crypto gate is the real one.

Call it **device auth**, not biometric: both platforms allow biometric _or_
device passcode against the same hardware-backed key
(`kSecAccessControlUserPresence`; `setUserAuthenticationRequired(true)` with
`DEVICE_CREDENTIAL`). Biometric-only would lock out every user who has not
enrolled a face or finger.

Three cases needing real UI, not an unhandled rejection:

1. **No device passcode at all** — the key cannot be created on either
   platform. A genuine hard block ("Set a device passcode to use this app"),
   honest for a wallet, and it will be hit.
2. **Existing passkey may not support PRF** — enrollment on web is "attempt PRF
   on the existing credential; if unavailable, register a new passkey with PRF
   requested," not simply "reuse their login passkey."
3. **Re-lock policy** — per launch, after N minutes backgrounded, or every
   open. Needs a default plus a user override.

### Offline session: a separate, longer-lived assertion

Do not stretch `cookieCache.maxAge`; it correctly bounds role-change staleness
for online requests. Add a distinct offline session assertion with an explicit,
configurable lifetime (7–30 days), usable **only** while genuinely offline, so
a long-lived offline token can never be used to skip revocation checks when the
network is reachable. Its lifetime is exactly the revocation gap — make it a
deliberate number rather than an accident of a cache TTL.

For `device-only`, store that assertion **encrypted under the device-auth key**.
Then there is exactly one gate: launch → device auth → key released → decrypt
assertion → valid ? cached shell : Offline Page. The presence or absence of a
session is not even observable without passing device auth.

**On the login screen specifically:** removing the login _form_ when offline is
correct — a form posting to an unreachable server is useless. Removing the
_session check_ is not. If "offline" alone unlocked the cached shell, airplane
mode would become an authentication bypass: a stolen phone in flight mode would
open straight into the cached launcher. The gate is a valid local session
(plus device auth for tier 3), and offline only changes what is shown in its
absence.

### Revise, don't route around, the architecture rule

Partition the document cache by user identity — cache name keyed to the user,
or the service worker refusing to serve a cached shell whose embedded identity
claim does not match the current session cookie — and delete that partition on
sign-out. The existing rule assumes an unpartitioned cache, which was true when
it was written. It should be rewritten to state the _requirement_
(a cached authenticated document must never be served to a different user)
rather than the _mechanism_ (never stale-serve), so it keeps protecting the
same thing without forbidding the only viable implementation.

### Launcher and shell states

Two visually distinct states, because they have different causes:

- **Connectivity-dimmed** — a no-offline-tier plugin, dimmed _only while
  actually offline_. Reactive, temporary. Reuse the existing online/offline
  detection.
- **Capability-restricted** — a `device-only` plugin on a surface without
  durable storage. Static, unrelated to connectivity, and must not say
  "offline" when the user is online. Reads as "Phone only."

Collapsing both into one grey treatment would tell a fully-connected desktop
user they are offline. Console and Settings are deliberately connectivity-
dimmed: administrative surfaces should not operate against stale cached state.

## Open questions

### 1. Escrow and recovery — the one genuinely undecided thing

Hardware-bound keys are invalidated by design: `biometryCurrentSet` dies when
fingerprints or face data change, deleting a passkey destroys its PRF secret,
and a lost or wiped device takes the key with it. For tier 2 that is harmless
(re-authenticate, re-sync). For **`device-only` it means permanent,
irrecoverable data loss.**

This is the same problem as the "bridge to migrate data between devices" idea —
device migration and key-invalidation recovery are one problem wearing two
hats.

| Option                        | Preserves sovereignty                         | Cost                                                                            |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| **Encrypted server backup**   | Yes — server stores ciphertext it cannot read | Needs a user-held recovery secret; users lose recovery codes                    |
| **User-driven export**        | Yes                                           | Most users will never do it — effectively "you will lose this"                  |
| **Accept the loss, state it** | Yes                                           | "Your health records are gone because you added a fingerprint" is a trust event |

No recommendation here deliberately. This is a product decision about what
Sovereign promises, not a technical one, and it should be made explicitly
before any RFC commits to a design.

### 2. Tier-3 delivery model

Origin isolation means a locally-bundled boot shell cannot read remote-origin
storage. Does `device-only` therefore need a genuinely different delivery path
(closer to option E) rather than the same thin shell with more caching? This
determines whether tier 3 is a moderate extension or its own workstream, and it
contradicts RFC 0082 §4's current position either way.

### 3. Key-strictness as a manifest field?

`biometryCurrentSet` (strict, invalidated on enrollment change) versus
`userPresence` (forgiving, survives it, but a coerced passcode opens it). A
wallet and a health log might reasonably choose differently. If so this is a
fourth manifest field; if not, the platform picks one for everyone.

### 4. Server-side revocation cannot reach device-only data

If local data unlocks with a device-held key, an admin deactivating an account
cannot wipe it. For a sovereignty product this is arguably correct — it is the
user's data on the user's device — but it contradicts the assumption behind the
current sign-out purge and must be a stated position rather than a discovery.

### 5. Next.js 16 adoption timing

`useOffline` does not solve cold start, but its connectivity detection is
strictly better than `navigator.onLine` and its Server Action retry overlaps
`sdk.offline-queue`. Worth sequencing deliberately rather than bundling into
this work.

### 6. Does `sdk.offline` need a public connectivity helper?

There is none today; `OfflineBanner.tsx` and plugin authors both use raw
browser APIs. If detection moves to `useOffline` semantics, a single SDK
surface would stop every plugin reimplementing it slightly differently.

## Next steps

This graduates to **multiple RFCs**, and realistically to a workstream rather
than a single task. Suggested split, in dependency order:

1. **Offline session and shell caching** — the revised architecture rule,
   per-user cache partitioning, the long-lived offline session assertion, the
   offline login/launch decision table.
2. **Tiered manifest and storage abstraction** — the `offline` enum, the
   migration from RFC 0074/0078, and one SDK surface over
   IndexedDB / OPFS-SQLite / native SQLite.
3. **Encryption and device auth** — key custody per tier, the
   `device:secureStorage` permission, RFC 0083 bridge methods for Capacitor and
   Tauri, PRF enrollment on web. **Gated on the escrow decision** (open
   question 1).
4. **Sync protocol for `offline-first`** — RFC 0078's queue is a primitive, not
   a sync engine; conflict policy, tombstones, partial sync, and resume all
   need design. Evaluate RxDB versus building it at this point, not before.

Before any of that:

- **Fix the `worker-` allowlist bug.** One token, unblocks service-worker
  installation for logged-out visitors, and materially improves today's
  behaviour independent of everything else here. Tracked separately.
- **Correct research 0008's attribution** and close its "root cause of the
  Android WebView `importScripts` redirect failure" open question — answered
  above.
- **Mark research 0009 superseded** by this doc.
- **Fix the documentation drift** listed under Findings (RFC index statuses,
  SRS §3.11, RFC 0074 §6's changelog claim, RFC 0082 §4's offline assertion).

RFC 0074 and RFC 0078 are both shipped and both proposed for **replacement**,
not extension. Any RFC arising from this should say so explicitly and carry the
`docs/upgrade.md` migration note for the third manifest shape change.
