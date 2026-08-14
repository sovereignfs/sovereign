# Workstream 0008 — Offline-first architecture

**Status:** ⏳ In progress — legs 1–3 done (leg 2 shipped at platform `0.65.0`–`0.66.0`;
leg 3 — tasks 3.36 + 2.33 — shipped at `0.76.0`; task 3.37 deliberately deferred,
see leg 3 detail); **leg 4 shipped its key-custody/session/escrow-Layers-1-2 scope**
(web WebAuthn PRF + native Keychain/Keystore, re-lock enforcement, encrypted
export/import, the reference plugin — see leg 4 detail for the full account and
what's still 🚧 partial in the epic docs); **leg 9 (`sovereign-mobile`, cross-repo)
mostly shipped** — the SQLCipher database is built and build-verified on both
platforms, and interactive end-to-end verification is done on iOS (real
device-credential round-trip plus the reference plugin surviving a full app
kill/relaunch); Android is build-verified but not interactively confirmed —
an emulator-specific SystemUI instability with credential/PIN screens, not a
code defect, see leg 9 detail — so leg 9 stays 🚧 partial rather than done;
its remaining scope (the real relational storage engines RFC 0093 §1 specs,
and Layer 3 escrow) is carved out into **legs 6–8 and 10**, same pattern leg 3
used for task 3.37; legs 6, 7, 8, 10 not started; leg 5 not started\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Goal owner:** kasunben\
**RFCs:** [0093](../rfcs/0093-device-only-storage-and-key-custody.md) (leg 4
only — device-only storage and key custody); legs 1, 2, 3, 5 have none,
governed directly by research 0012 under the
[research-as-design exception](../documentation-structure.md) — see the note
below\
**Epics touched:** 1 (Users & Auth), 2 (Platform Shell), 3 (Plugins Runtime),
8 (Data Sovereignty), 20 (Mobile)\
**Research:** [0012](../research/0012-offline-first-architecture.md)
(supersedes [0009](../research/0009-offline-database-architecture.md); builds on
[0008](../research/0008-wkwebview-android-webview-offline-spike.md))

> **Why there is no RFC — mostly.** Research 0012 already carries the settled
> design for legs 1, 2, 3, and 5: the options were weighed, the choices made,
> and the rejected alternatives recorded. An RFC restating them would add a
> review cycle without adding a decision. This is the first use of the
> research-as-design exception documented in
> [documentation-structure.md](../documentation-structure.md); its four
> conditions are met for those legs — rejected alternatives are written down,
> the decisions are carried forward in the table below, and both this document
> and the epic tasks cite research 0012 where they would otherwise cite an RFC.
>
> **Leg 4 is the exception to the exception.** Research 0012 deliberately left
> its escrow question (and, it turned out, its key-strictness question too)
> unresolved — genuinely open, not just unwritten. Once a design session
> resolved both, the result was substantial and reviewable enough on its own
> to warrant an actual RFC rather than a paragraph added back into the
> research doc: **[RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md)**
> (Accepted), covering key custody and data-loss recovery for `device-only`
> on both native and web. Leg 4 is governed by RFC 0093, not directly by
> research 0012 — the rest of this workstream still is.

---

## Goal

Sovereign's offline support is **online-first with offline as a fallback**: a
network application that degrades when the connection drops. At the end of this
workstream it is **offline-first** — the device holds a real copy of the data
and the network is what makes it fresh. A user can cold-launch the app with no
connectivity and reach their home screen; plugins declare how much offline
capability they need rather than getting one all-or-nothing flag; and data that
should never leave the device is stored durably and encrypted, unlocked by
device authentication.

This is a sovereignty requirement before it is a feature: a self-hosted
workspace whose apps stop working when the user's connection does is not
meaningfully under the user's control.

## Definition of done

- [x] A returning user can cold-launch the installed PWA or native shell with
      **zero connectivity** and land on their home screen — not a white screen,
      not the generic `/offline` page. Shipped in leg 2 — `/` is offline-eligible
      via the neutral-shell mechanism (`runtime/src/registry.ts`'s
      `getOfflineRoutePrefixes()`), live-tested cold against a real build.
- [x] A user whose session has expired sees a purpose-built notice explaining
      they need a connection to sign in — **not** a login form that cannot
      work, and **not** an unlocked cached shell. Shipped in leg 2, but not as
      originally envisioned: there is no separate session-expired page — the
      generic `/offline` page (`runtime/app/offline/page.tsx`) covers every
      offline navigation failure, and `runtime/app/login/login-form.tsx` uses
      `useIsOffline()` to swap the login form itself for a notice when
      `/login` is viewed offline. Functionally equivalent to the original
      wording; the mechanism differs.
- [x] Airplane mode is **not** an authentication bypass. Shipped in leg 2, via
      a stronger guarantee than originally envisioned: the signed
      offline-session-assertion gate this item originally described was
      built, found to be dead code (`refreshOfflineSession()` was never
      called), and removed outright — see leg 2's "Mechanism superseded"
      note. What ships instead is simpler and strictly safer: the `pages`
      cache never stores personalized content at all (`NetworkOnly`
      effective behavior), so there is no cached authenticated document to
      replay regardless of session state. Only manifest-declared
      `offline: 'offline-first' | 'device-only'` routes render offline, and
      those are user-neutral by construction.
- [x] A cached authenticated document can never be served to a different user
      on a shared device, with a regression test proving it. Shipped in leg
      2 — live-tested directly (sign out, go offline, reload `/`) against a
      real production build; see `docs/architecture-rules.md`'s "cached
      authenticated document" rule.
- [x] Plugins declare `offline: 'offline-first' | 'device-only'`; omitting the
      field means no offline support, and that remains the default. Shipped
      in leg 3, task 3.36, at platform `0.76.0`.
- [ ] `offline-first` plugins read and write locally and sync in the background;
      `device-only` plugins never send data to the server. The `device-only`
      half is trivially true today (leg 10/Layer 3 hasn't shipped, so there
      is no code path that could send that data to the server at all). The
      `offline-first` half needs leg 5 (background sync, task 3.38 — not
      started).
- [x] Offline data is encrypted at rest in **both** offline tiers, for the
      backends that exist today. `offline.ts` (offline-first, IndexedDB)
      AES-GCM-encrypts every entry via `offline-device-key.ts`; `device-only-kv.ts`
      (device-only) is independently AES-GCM-encrypted. **Scope note:** legs
      7–8 (not started) add a real relational SQL engine on web — when that
      lands, this item needs re-verification against the new backend; it
      does not need to stay unchecked until then, since no plugin can reach
      an unencrypted engine that doesn't exist yet.
- [x] `device-only` plugins refuse to expose their data without the user's
      Device Storage Key set up (Account → Security), and that is enforced by
      key custody, not a UI check. Shipped in leg 4 — `DeviceOnlyGate`/
      `DeviceStorageKeyGate` backed by real WebAuthn PRF (web) and
      Keychain/Keystore (native) key custody, not a JS flag.
- [ ] The escrow/recovery position is decided, documented, and implemented.
      Decided and documented: [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md),
      Accepted. Implemented: Layers 1–2 (warning copy, encrypted export) shipped
      in leg 4; Layer 3 (opt-in encrypted server backup) is leg 10, not started.
- [x] RFC 0074 and RFC 0078 are marked superseded, with a `docs/upgrade.md`
      migration note for the manifest change. Both RFCs carry a Superseded
      banner and are listed as such in `docs/rfcs/README.md`; `docs/upgrade.md`
      has the migration note for the manifest field's enum shape change and a
      separate note on the removed offline-session-assertion mechanism.

## Decisions locked

Settled by research 0012. Not to be reopened mid-execution.

| Decision                    | Choice                                                                                                                                            | Rejected alternative and why                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall model               | Offline-first — device holds a real copy, network makes it fresh                                                                                  | Harden the current online-first model: cannot deliver cold-start offline, durable storage, or a device-only tier at all.                                                            |
| Tier count                  | Three: none (default) / `offline-first` / `device-only`                                                                                           | One uniform tier — most plugins do not need it, Console and Settings arguably should _not_ work offline, and forcing it on every author is hostile.                                 |
| Tier gating                 | **Capability detection** — is a durable, encrypted, device-auth-gated store available?                                                            | `sdk.device.getSurface()` — documented in `docs/sdk-stability.md:65` as a presentation hint, never a security boundary, and trivially spoofable. Would also bake in today's limits. |
| Manifest shape              | `offline: z.enum(['offline-first', 'device-only']).optional()`                                                                                    | Keeping `offline: boolean`; adding an explicit "off" literal (reintroduces the ambiguity RFC 0078's flattening removed); naming it `offline-only` (reads badly).                    |
| `offline:write` permission  | Dropped — the enum is sufficient install-review signal                                                                                            | Keeping it: redundant once both tiers imply local mutation. Dropping it also resolves RFC 0074's open question 1.                                                                   |
| Encryption scope            | Both offline tiers encrypt at rest; tiers differ only in **what guards the key**                                                                  | Encrypting only `device-only` — leaves tier-2 data plaintext and misleads authors who reasonably assume "offline data is protected".                                                |
| Device auth mechanism       | **Key custody** — the OS releases the key after auth; data on disk is ciphertext                                                                  | A UI gate that flips `unlocked = true` in JS — an attacker reads storage directly and never runs our code. Security theater.                                                        |
| Device auth definition      | Biometric **or** device passcode, against the same hardware-backed key                                                                            | Biometric-only — locks out every user who has not enrolled a face or finger.                                                                                                        |
| `device-only` enrolment     | Structural: no preference/toggle exists. ~~Enabling the plugin _is_ the enrolment~~ — refined below, "Where/when device-auth enrollment happens." | A user-facing toggle — creates a state to enforce and to drift out of sync.                                                                                                         |
| Offline session             | A separate, explicitly-scoped, long-lived offline assertion                                                                                       | Raising `cookieCache.maxAge` (`apps/auth/src/auth.ts:56`) — that 300s value correctly bounds role-change staleness for _online_ requests.                                           |
| Offline login behaviour     | Remove the login **form**; keep the session **check**                                                                                             | Unlocking the cached shell on "offline" alone — makes airplane mode an authentication bypass on a stolen device.                                                                    |
| Service-worker caching rule | Rewrite it to state its **requirement**, not its mechanism                                                                                        | Leaving it as-is — nothing else can serve a document with no network, and Next.js 16.3's `useOffline` explicitly does not close that gap.                                           |
| Sync engine                 | Build it; keep RxDB as a fallback if it proves larger than expected                                                                               | PowerSync (FSL-licensed service, separate Docker dep, Postgres-oriented); ElectricSQL (Postgres-only, read-path only); Zero (offline explicitly out of scope per its own authors).  |
| Conflict resolution         | Last-write-wins timestamps, as RFC 0078 already uses                                                                                              | CRDTs (Yjs/Automerge/Loro) — they solve concurrent multi-writer editing; Sovereign's data is predominantly single-writer-per-record. Decided against explicitly.                    |

**Resolved — see [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md):**

| Decision                                         | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escrow and recovery for `device-only` data       | Three layers, progressive: mandatory plain-language warning, always-available encrypted user export, opt-in encrypted server backup gated by an `.env` → Console → per-plugin per-user opt-in cascade (RFC 0093 §4).                                                                                                                                                                                                                           |
| Whether key strictness is manifest-declared      | No — one platform-wide setting, `userPresence`-equivalent (biometric **or** device passcode) on every platform (RFC 0093 §5). Not really a tradeoff between two viable options once accessibility is accounted for.                                                                                                                                                                                                                            |
| Whether revocation should reach device-only data | No, by design, on either platform — the server never holds a usable key (RFC 0093 §7). A stated exception to the sign-out purge's usual assumption, to be recorded in `docs/architecture-rules.md` once implemented.                                                                                                                                                                                                                           |
| Where/when device-auth enrollment happens        | Centralized: one "Device Storage Key," set up once in Account → Security (parallel to RFC 0060's Client-side encryption section, independent secret), shared by every `device-only` plugin — not per-plugin. Supersedes this table's original "enabling the plugin _is_ the enrolment" framing above, which conflated plugin access (RFC 0065) with Device Storage Key existence; the two lifecycles are deliberately decoupled (RFC 0093 §2). |

These were previously tracked as open gates on task 8.21, owners kasunben/
Platform. RFC 0093 is the record of that decision being made; the epic tasks'
own "gated on 8.21" language should be read as satisfied, not still pending.

**Closed since the initial draft:** whether `device-only` needs a different
delivery model. Workstream 0003's leg 4 outcome answers it — the bridge reaches
the remote instance origin on both platforms, and native storage is not
origin-partitioned. See leg 3 detail.

## Prerequisites

| Prerequisite                                                                   | Owner    | Status                                                                              |
| ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| Service worker installs for logged-out visitors (`worker-` allowlist)          | Platform | ✅ Done — `2ac31cf`                                                                 |
| Research 0008's Android misattribution corrected                               | Platform | ✅ Done — same commit                                                               |
| Research 0009 marked superseded                                                | Platform | ✅ Done                                                                             |
| **Escrow/recovery position chosen** — encrypted backup, export, or accept loss | kasunben | ✅ Done — [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md), Accepted |

## Legs

| Leg | Name                                                        | Epic tasks              | Epics    | Gate?   | Done when                                                                                                                                                               |
| --- | ----------------------------------------------------------- | ----------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Record correction                                           | —                       | —        | No      | The four documentation-drift items are fixed; the record matches reality.                                                                                               |
| 2   | Cold-start offline shell                                    | 1.21, 2.31, 2.32        | 1, 2     | No      | A cold launch with no connectivity reaches the home screen or the Offline page.                                                                                         |
| 3   | Tiered plugin offline model                                 | 3.36, 3.37, 2.33        | 2, 3     | No      | Tiers ship; `device-only` availability follows bridge capability.                                                                                                       |
| 4   | Encryption and device auth                                  | 8.21, 20.13, 8.20, 1.22 | 1, 8, 20 | **Yes** | Offline data is encrypted in both tiers; `device-only` unlocks by device auth.                                                                                          |
| 5   | Background sync                                             | 3.38                    | 3        | No      | An offline write reaches the server after reconnect, exactly once.                                                                                                      |
| 6   | Unified storage surface — IndexedDB + native backends       | 3.37 (partial)          | 3, 20    | No      | A plugin author calls one API; it lands on IndexedDB or the native bridge depending on surface, with the OPFS/SQL backend still a stub.                                 |
| 7   | OPFS + `wa-sqlite` engine (unencrypted)                     | 3.37 (completion)       | 3        | **Yes** | A Worker-hosted `wa-sqlite` database, backed by `OPFSCoopSyncVFS`, persists real SQL data across a reload — plaintext, not yet reachable by any `device-only` plugin.   |
| 8   | Encryption at rest for the new web engine                   | 8.20 (completion)       | 8        | **Yes** | Every page the web SQL engine writes is ciphertext under the Device Storage Key; a live write → lock → unlock → read round-trip passes on a real browser.               |
| 9   | Native SQLCipher database · cross-repo (`sovereign-mobile`) | 20.13 (completion)      | 20       | No      | `@capacitor-community/sqlite` + SQLCipher backs a real `device-only` plugin's data on iOS and Android, keyed by task 20.13's already-shipped Keychain/Keystore custody. |
| 10  | Layer 3 escrow — opt-in server backup                       | 8.21 (completion)       | 2, 8, 13 | No      | With the `.env` flag and Console toggle both on, a user can opt one `device-only` plugin into encrypted server backup, and back out.                                    |

Each leg is one branch, one draft PR, one review gate. The agent runs
uninterrupted within a leg and stops at its end. See
[README.md](README.md#the-leg-contract).

## Leg detail

### Leg 1 — Record correction

**Epic tasks:** none — documentation only.

**Why this leg is first:** legs 2–4 supersede RFC 0074 and RFC 0078. Superseding
a document whose recorded status is already wrong compounds the error, and the
`docs/upgrade.md` migration note will cite these statuses.

**Tasks, in order:**

1. `docs/rfcs/README.md:92,96` — RFC 0074 reads "Partially implemented (platform
   plumbing; no adopting plugin yet)" and RFC 0078 reads "Draft". Both RFC
   headers say Implemented and `ROADMAP.md:178,186` marks both ✅. Launcher did
   adopt 0074 in-repo, so the parenthetical is wrong too.
2. `docs/sovereign-proposal-plan-srs.md:700` — "Plugin data is not cached offline
   in v1" is contradicted by both shipped RFCs.
3. `docs/rfcs/0074-offline-capable-plugins.md:392,557` — the changelog claims
   `middleware.ts` flags `/` with `x-sovereign-offline-route` unconditionally.
   `runtime/middleware.ts:544-558` explicitly does not, with a comment explaining
   the revert; git history shows this flip-flopped four times.
4. RFC 0082 §4 — "offline… is entirely the web stack… nothing about offline is
   native-specific, and that is the payoff." A `device-only` tier backed by
   native SQLite contradicts this. Correct it to say offline _delivery_ is the
   web stack but `device-only` _storage_ is native — that is the precise split
   workstream 0003's leg 4 outcome established, and leg 3 no longer reopens it.

**Do not proceed if:** any correction turns out to be a live disagreement rather
than drift — e.g. if RFC 0074's `/` claim reflects intended behaviour reverted in
error. Escalate rather than picking a side.

### Leg 2 — Cold-start offline shell

**Epic tasks:** 1.21 + 2.31 together, then 2.32.

**Why this leg is first among the implementation legs:** it depends on nothing
else, delivers the headline requirement, and is the only leg that must revise a
hard architectural rule. It is also the largest standalone user-visible win here
and stands on its own if the workstream stops afterwards.

> **Correction found during execution (August 2026).** Tasks 1.21 and 2.31 were
> planned as sequential, and 1.21 specified a `runtime/middleware.ts`
> verification path. Both were wrong. **Middleware never runs when the device is
> offline** — the navigation request fails and the service worker serves a
> cached document with no server involvement — so the offline session decision
> belongs in the SW. And because the SW can only pick a per-user cache partition
> if it already knows which user its assertion names, 1.21 and 2.31 are one
> mechanism and must be built together.
>
> The SW cannot verify an HMAC (that needs `AUTH_SECRET`, which must never reach
> the browser), so the assertion is signed with the **better-auth `jwt()`
> keypair already enabled** (`apps/auth/src/auth.ts:240`) and verified in the SW
> via WebCrypto against the JWKS already published at `/.well-known/jwks.json`.
> Signing does not stop replay of a still-valid assertion — the cached shell is
> on the device regardless — but it does stop the offline window being extended
> or the partition being re-pointed at another user, which is exactly what
> shared-device safety needs. Both task specs have been corrected in place.

**Technical notes:** today's `x-sovereign-offline-route` neutral-shell mechanism
(`runtime/middleware.ts:526-558`, `runtime/src/registry.ts:35-39`) and the
`offline-route-neutrality.test.ts` static scanner both solve "don't render
per-user content on a precacheable route". Per-user partitioning (2.31) may make
that requirement unnecessary — decide explicitly rather than carrying both.
Flagging `/` has already been added and reverted twice; read the comment at
`runtime/middleware.ts:544-558` before touching it.

**Do not proceed if:** per-user partitioning cannot be made robust for the
shared-device case. That is the entire reason the current rule exists, and
shipping a weaker guarantee is worse than shipping no cold-start offline.

> **Mechanism superseded (August 2026, patch `0.76.1`).** It wasn't robust —
> found by actually doing the adversarial shared-device test this leg's own
> "do not proceed if" called for, rather than trusting the code review that
> shipped it: sign a test user out, take a real production build offline,
> reload `/`, and the previous user's fully personalized cached shell
> rendered anyway. Two compounding causes, neither caught by `pnpm test`.
> First, `next-pwa`'s own default caching of bare `/` (the PWA `start_url`)
> was never routed through this leg's assertion/partitioning mechanism at
> all — it has no per-user cache key or session check of its own, and `/`
> is the actual cold-launch entry point (`start_url: '/'`), not a corner
> case. Second, independently: `refreshOfflineSession()`, the client-side
> piece meant to populate the signed assertion after login, was never
> called anywhere in the app — so even where the partitioning mechanism
> _was_ wired to a route, it had nothing to verify and fell back to an
> anonymous key every time.
>
> This directly answers line 186's open question above ("decide explicitly
> [whether per-user partitioning makes the neutral-shell mechanism
> unnecessary] rather than carrying both") — the opposite way expected.
> Per-user partitioning is gone; the neutral-shell mechanism is now the
> _only_ one, extended to cover `/` itself (`runtime/src/registry.ts`'s
> `getOfflineRoutePrefixes()` — `/` is offline-eligible whenever Launcher,
> the default root, is itself offline-first). Every other page (`pages`
> cache entry) no longer caches personalized content at all — `NetworkFirst`
> with a `cacheWillUpdate` that always returns `null` (`workbox-build`
> rejects `networkTimeoutSeconds` on any handler but `NetworkFirst`, even
> though `NetworkOnly` supports it at the `workbox-strategies` runtime
> level — a config-validation restriction, not a strategy one; net effect
> is identical to `NetworkOnly`, nothing is ever written), generic
> `/offline` fallback on any failure, no exceptions. Full account:
> `docs/architecture-rules.md`'s "cached authenticated document" rule,
> `docs/epics/users-auth.md` task 1.21's correction note, and
> `runtime/next.config.ts`'s comment above `runtimeCaching`.
>
> **Resolved (August 2026), was filed above as an open question.**
> Live-tested the critical property directly — sign out, go offline, reload
> `/` — and confirmed the stale-shell replay is gone; that held from the
> start. The generic-fallback UX for a non-offline route (`/console`) while
> genuinely offline did not: a real top-level navigation showed a raw
> browser error (`net::ERR_FAILED` in Chrome) instead of the `/offline`
> page, reproducing identically in a real built-and-deployed Docker image
> and on pre-fix `main` — not a regression this leg introduced, and not an
> AI-agent browser-automation artifact either, as first suspected. Per this
> note's own prior instruction, it was checked on a real device: the iOS
> Simulator's actual Safari/WebKit engine (not the CDP-driven automated
> browser used for the rest of this workstream's testing) reproduced it too,
> and — critically — WebKit's error page prints the underlying exception
> Chrome's `net::ERR_FAILED` hides: `FetchEvent.respondWith received an
error: ReferenceError: Can't find variable: _async_to_generator`.
>
> Root cause: Next's own `next.config.ts` loader
> (`next/dist/build/next-config-ts/transpile-config.js`) transpiles this
> file through SWC, and — because the compiled output contains `require(`
> — registers a _global_ CommonJS require hook that runs every module
> reached from `next.config.ts` through that same SWC pass, including
> third-party dependencies like `@ducanh2912/next-pwa`. That pass downlevels
> `async` functions to `_async_to_generator(...)`/`_ts_generator(...)`
> calls, but the helper _definitions_ live only in the transpiled module's
> own scope, never in the function's own source text. `workbox-build` then
> does exactly the `Function.prototype.toString()` capture this workstream's
> own regression test (`next-config-sw-matchers.test.ts`) was written to
> guard, embedding these functions into `sw.js` — so the helper calls
> survive the trip but their definitions don't. Every `async` plugin hook in
> `runtimeCaching` — ours or next-pwa's own auto-injected
> `handlerDidError` — threw `ReferenceError` the instant the service worker
> invoked it, for any request that fell through to it (i.e. any
> non-precached, non-offline-shell route with no cached response to fall
> back on — exactly `/console` cold). Fix: `runtime/next.config.ts`'s
> `pages` and `offline-shells` entries now each declare their own plain
> (non-`async`) `handlerDidError`, bypassing next-pwa's broken
> auto-injection entirely; `pages`' `cacheWillUpdate` returns
> `Promise.resolve(null)` instead of using the `async` keyword, for the same
> reason. `next-config-sw-matchers.test.ts` gained a regression test
> asserting no plugin hook function is ever declared `async`. One narrower
> instance of the same bug class remains: next-pwa's built-in default
> `runtimeCaching` entries (pulled in via `extendDefaultRuntimeCaching:
true`, e.g. its `google-fonts-webfonts` cache) still get the broken
> auto-injected `handlerDidError`, since those entries are defined inside
> next-pwa itself, not something this file declares or can override
> per-entry. Not addressed here — Sovereign is self-hosted and doesn't route
> through Google's font CDN by default, making this a narrow, likely-dead
> edge case rather than a live gap — but noted for whoever next touches this
> file.

### Leg 3 — Tiered plugin offline model

**Epic tasks, in execution order:** 3.36 → 3.37 → 2.33.

**Scope correction found during execution (August 2026).** Tasks 3.36 and 2.33
shipped together at platform `0.76.0` — the manifest `offline` enum, Launcher's
migration to it, and the `connectivity-dimmed`/`capability-restricted` tile
states. Task 3.37 (the unified offline storage SDK surface) turned out to be a
much bigger, independently reviewable unit — replacing `sdk.offline`/
`sdk.offline-queue` with one API over three storage backends — with no
dependency the other two tasks need, so it was carved out into its own
follow-on leg (leg 3b) rather than blocking this leg's PR. `isDeviceOnlyTierAvailable()`
(`@sovereignfs/sdk/device-client`) shipped in this leg regardless, since 2.33's
tile states need it; it returns `false` everywhere until leg 4 ships the
`secureStorage` bridge capability.

**This leg was originally a gate; it is not one.** The concern was that origin
isolation would force `device-only` onto a different delivery model — a bundled
`capacitor://` page cannot read web storage written by the remote
`https://instance` origin. Workstream 0003's leg 4 outcome already answers this
empirically, verified on both iOS Simulator and Android Emulator (2026-08):

- A narrow `__SOVEREIGN_BRIDGE__` is injected **scoped to the runtime-chosen
  active instance origin**, and `haptics.impact` / `notifications.native`
  round-trip to `{status:'ok'}` **from the loaded remote instance page**.
- Native storage is **not web storage**. It lives in the app sandbox and is
  reached through that same bridge. Origin partitioning governs
  IndexedDB / OPFS / Cache API — not it.

So `device-only` data reached via `secureStorage` has no origin-isolation
problem, and needs no separate delivery path on that account. RFC 0082 §4's
claim that offline is "entirely the web stack" is still wrong — `device-only`
depends on a native capability — but it is wrong about _storage_, not about
_delivery_.

**What remains is a verification item, not a design fork**, and it belongs to
leg 2: confirm the service-worker-cached shell cold-starts inside the Capacitor
WebView, not only in a browser PWA. That is the same question for every tier,
so it is not `device-only`'s to answer. Fold it into epic task 20.10 (the
WKWebView spike, already ⏳ in progress) as one added check — write via the
bridge to native storage from the remote-origin page, kill the network,
relaunch, read it back. Research 0008's method already covers this shape.

**Technical notes:** `OPFSCoopSyncVFS` (wa-sqlite) is the current web pick and
does **not** require COOP/COEP, unlike the official `sqlite-wasm` OPFS build —
those headers would fight the CSP. Research 0008 confirmed IndexedDB works in
every tested context including iOS `capacitor://`, and that iOS discards
in-memory JS state across a background/foreground cycle while Android preserves
it: flush to storage as data is produced, never buffer in memory. Task 3.36 is a
**breaking** manifest change — one major bump for the leg, plus the upgrade note.

**Do not proceed if:** the 20.10 check shows native storage is _not_ reachable
from the remote-origin document after all. That would contradict workstream
0003's verified result, so treat it as a finding worth escalating rather than
routing around.

### Leg 4 — Encryption and device auth · cross-repo · design Accepted, ready to implement

**Epic tasks, in execution order:** 8.21 → 20.13 → 8.20 → 1.22, with the two
native transport halves owned by the shell repos (see split below).

**Design:** [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md)
(Accepted, August 2026). Read it before starting any of this leg's tasks —
it supersedes the summary that used to live in this section, and covers key
custody (native Keychain/Keystore, web WebAuthn PRF), the second-wrapper
design that survives a deleted passkey or biometric change without
touching escrow, the three-layer escrow cascade, key strictness, and the
revocation position. Task 8.21 is now a documentation/implementation task
against an already-accepted design, not an open product decision — the
"leads the leg because everything branches on the answer" framing no longer
applies; 8.21's remaining work is wiring the decision into Console/`.env`/
Account UX, not making it.

**No longer a workstream gate.** It was marked **GATE** while the escrow
decision was open, to stop any agent starting leg 4 before a human decision
existed. That decision now exists and is recorded in RFC 0093. Leg 4 can
be picked up and prioritized like any other leg — the remaining "not
started" is a scheduling fact, not a blocked one.

**Repo split** — this leg spans three repositories, following the pattern
workstream 0003 used for the device bridge:

| Piece                                                                         | Repo                | Task                            |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------- |
| `device:secureStorage` permission, bridge protocol, encrypted-store semantics | this repo           | 20.13                           |
| Tauri transport — keychain-backed `secureStorage`                             | `sovereign-desktop` | 17.4 / workstream 0003 leg 3b   |
| Capacitor transport — SQLCipher + Keychain/Keystore                           | `sovereign-mobile`  | extends 20.3's bridge transport |
| Encryption at rest, WebAuthn PRF on web, escrow                               | this repo           | 8.20, 1.22, 8.21                |

The platform-side pieces (protocol, permission, encryption, PRF) must land first
— the shells implement against a published `@sovereignfs/bridge` contract, not
the other way around. The two native transports are then independent of each
other and can run in parallel in their own repos.

**`secureStorage` already exists as a planned capability — do not restate it.**
RFC 0083 §8 defines it, epic task **17.4** covers the Tauri transport, and
workstream 0003 **leg 3b** tracks it as not started, parked because "there is no
plugin-facing urgency driving this leg — pick it up when that consumer is ready
to be built, or sooner if a concrete need emerges." Research 0012's `device-only`
tier **is** that concrete need. Task 20.13 adds only what is genuinely new: the
plugin-facing permission, the encrypted-store semantics (SQLCipher, user-presence
keys), and the Capacitor transport. It does not duplicate 17.4.

**Technical notes:** the crypto and key-custody detail (PRF specifics,
SQLCipher, access-control flags) lives in RFC 0093 now — don't duplicate it
here. Still true and still worth restating locally: current device
permissions are only `device:haptics` and `device:notifications`
(`packages/manifest/src/schema.ts:37-38`), so `device:secureStorage` is new
manifest surface, and workstream 0003's standing rule applies — a shell's
`capabilities` list must reflect what that build actually supports;
advertising a capability the transport does not implement is worse than
omitting it, because the caller's `unavailable` path never runs.

**Do not proceed if:** implementation drifts from RFC 0093's design without
a documented reason — e.g. reintroducing the biometric-only flag RFC 0093
§5 explicitly corrected, or a PIN-only gate §2 explicitly rejected. Either
is a sign the implementer didn't read the RFC's "Alternatives considered"
before re-deriving the same dead end.

> **Shipped scope, and what got carved out (August 2026).** Leg 4 ran across
> several PRs rather than the usual single-PR leg — its real size only became
> clear during execution, the same thing that happened to task 3.37 in leg 3.
> **Shipped:** web WebAuthn PRF key derivation with re-lock session
> enforcement (`device-only-session.ts`); native Keychain/Keystore key
> custody, build-verified on both platforms (`sovereign-mobile`); the
> Account → Security "Device Storage Key" section (setup, recovery code,
> Auto-lock, Export/Import data); RFC 0093 §4's escrow Layers 1
> (strengthened warning copy) and 2 (`device-only-export.ts`, wired into a
> real UI); a reference plugin (`example-plugins/example-device-only`)
> proving the whole chain end to end. Task 1.22 is 🚧 (every deliverable
> shipped; two review-checklist claims — real-browser OPFS behavior,
> interactive biometric/PRF ceremonies — are unverified for lack of
> hardware here, see its own epic entry). Tasks 8.21 and 20.13 are 🚧 for
> the reasons below. **Carved out, not shipped:** the actual relational
> storage engines RFC 0093 §1 specs (`wa-sqlite` on web, SQLCipher via
> `@capacitor-community/sqlite` on native) — what shipped instead is a
> smaller, immediately-buildable stopgap, `device-only-kv.ts`, an
> AES-GCM-encrypted key/value store with no queries or joins (see its own
> doc comment). Task 8.20 is 🚧 for this reason. Also carved out: RFC
> 0093 §4's Layer 3 (opt-in encrypted server backup cascade) — deliberately
> deferred as a separate, large piece (Console UI, `.env` gate, DB schema,
> Docker-config impact). These four gaps — the two relational engines,
> their encryption, and Layer 3 — are **legs 6–10** below, not restated here.

### Leg 5 — Background sync

**Epic tasks:** 3.38.

**Technical notes:** RFC 0078's `offline-queue` is a primitive — idempotent
enqueue plus a manual `drainQueue()` — not a sync engine. Its 500-entry hard cap
throws rather than evicting, deliberately; preserve that property.

**Do not proceed if:** the design implies a continuous bidirectional sync engine
substantially larger than the rest of this workstream combined. Research 0012
converged on network-first-with-local-fallback rather than continuous local-first
sync; if the design drifts there, stop and revisit.

### Leg 6 — Unified storage surface: IndexedDB + native backends (task 3.37, partial)

**Epic tasks:** 3.37 (the IndexedDB and native-bridge backends only — the OPFS
backend is leg 7).

**Why this leg is first among 6–10:** it ships the new unified API's _shape_
against the two backends that need no novel engineering — IndexedDB already
works (`offline.ts`/`offline-queue.ts` exist today) and native SQLite is
reached through the bridge, not built here — so the hard part (leg 7) starts
from an API surface already exercised by two working backends instead of
being designed and built at the same time.

**Goal:** one plugin-facing API — capability-selected between IndexedDB, the
(stubbed, until leg 7) OPFS/SQL backend, and native SQLite — replacing
`packages/sdk/src/offline.ts` and `offline-queue.ts` as described in task
3.37's own deliverables. Do not re-derive that list here; read it.

**Technical notes:**

- `offline.ts` already gained encryption-at-rest this session
  (`offline-device-key.ts`, task 8.20) — preserve that property when folding
  it into the unified surface, not just the API shape.
- Preserve the existing cross-tab `BroadcastChannel` purge safety and the
  sign-in/sign-out purge sites (`runtime/src/complete-sign-in.ts`) — task
  3.37's own review checklist calls this out explicitly.
- The OPFS/SQL backend can be a capability-detection stub that always reports
  unavailable until leg 7 lands — plugins on that backend fall back to
  IndexedDB in the interim, same fallback behavior task 3.37 already
  specifies for Safari private browsing (no OPFS there either).
- `device-only-kv.ts` (this session's stopgap) is **not** what this leg
  unifies underneath — it stays as-is, serving `device-only` plugins, until
  leg 7's real engine exists to replace it. Don't start migrating
  `device-only-kv.ts` callers in this leg.

**Do not proceed if:** the unified API's shape can't accommodate a genuinely
relational backend later without a breaking change — that would mean leg 7
forces a second breaking API change right after this one ships. Design the
interface leg 7 will need (even though leg 7 doesn't implement it yet)
before finalizing this leg's surface, not after.

### Leg 7 — OPFS + `wa-sqlite` engine, unencrypted · GATE

**Epic tasks:** 3.37 (completion — the OPFS/SQL backend).

**Why this leg is a gate:** everything downstream (leg 8's encryption layer,
any future migration of `device-only-kv.ts` callers onto a real relational
store) assumes a Worker-hosted `wa-sqlite` engine actually works acceptably
in the browsers this platform supports. That assumption is well-founded —
`OPFSCoopSyncVFS` is a real, used-elsewhere pattern, not a fresh design bet —
but it has never been tried in this codebase, so treat it as unproven until
this leg's own live round-trip passes.

**Goal:** a working, _unencrypted_ SQLite database via `wa-sqlite`'s
`OPFSCoopSyncVFS`, running in a dedicated Worker, that persists real SQL data
(a table, a few rows, a `SELECT … WHERE`) across a page reload in a real
browser. Deliberately not wired to any plugin or the Device Storage Key yet —
proving the architecture is the whole point of this leg; encryption is leg 8.

**Technical notes:**

- **Must run in a Worker.** `OPFSCoopSyncVFS` needs `FileSystemSyncAccessHandle`,
  which browsers only expose inside a dedicated Worker, not the main thread.
  The main-thread React code talks to the Worker over `postMessage` — design
  that message protocol as part of this leg, it doesn't exist yet anywhere in
  this codebase.
- **Bundling the `.wasm` binary** needs Next.js asset-handling changes and
  probably a service-worker precache entry (`runtime/next.config.ts`'s
  `runtimeCaching`) so it's available offline once fetched once. Check CSP
  implications — WASM instantiation can require `'wasm-unsafe-eval'`
  depending on how it's compiled/streamed; the nonce-based CSP
  (`docs/architecture-rules.md`'s "never `'unsafe-inline'` in `script-src`"
  rule) must still hold.
- **No COOP/COEP headers** — this is _why_ `OPFSCoopSyncVFS` was picked over
  the official `sqlite-wasm` OPFS build in the first place (RFC 0093 §1,
  research 0012). If the implementation ends up needing those headers
  anyway, that's a finding worth surfacing immediately, not routing around —
  they would fight this platform's CSP.
- **Verification tier is different from everything else in this workstream.**
  A hand-rolled OPFS fake (the pattern `device-only-kv.ts`'s and
  `offline.ts`'s test suites both use) cannot meaningfully stand in for a
  real SQLite engine with a custom VFS. This leg needs actual browser
  verification — Playwright (`'@playwright/test'` is already a pinned
  catalog dependency, not yet used for anything like this) or, at minimum,
  manual verification via the preview/browser tools against a real dev
  server, not a unit test claiming success.

**Do not proceed if:** a real-browser spike shows `OPFSCoopSyncVFS` doesn't
perform acceptably, or the Worker/main-thread messaging overhead makes
routine plugin queries noticeably slow. That's new information worth
escalating — it would mean `device-only-kv.ts`'s simpler KV shape is not a
temporary stopgap but the right permanent answer for this platform, and
leg 7 (and everything downstream of it) should be reconsidered, not pushed
through.

### Leg 8 — Encryption at rest for the new web engine · GATE

**Epic tasks:** 8.20 (completion — the web relational engine's half; native
SQLCipher is leg 9).

**Why this leg is a gate, and why it is separate from leg 7:** encryption
surfaces in this repo have a documented track record of looking more
finished than they are — RFC 0071 needed three hardening passes including a
production incident
(`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`) before it was
ultimately retired outright. Keeping this leg narrowly scoped to _just_ the
crypto layer, reviewed on its own rather than folded into leg 7's larger
architectural change, is a deliberate application of that lesson.

**Goal:** every page `wa-sqlite` writes to OPFS is ciphertext, keyed by the
already-unlocked Device Storage Key (`device-only-session.ts`'s
`getUnlockedDeviceStorageKey()` — reused, not reinvented) for `device-only`
callers. A live write → lock → unlock → read round-trip, verified by
inspecting the raw OPFS file's bytes directly (not just through the app),
passes in a real browser — matching task 8.20's own standing review-checklist
requirement.

**Technical notes:**

- This needs a **page-level encrypting shim in the VFS**, not a
  wrap-the-whole-file approach — SQLite reads/writes fixed-size pages
  individually, and a VFS-level shim is the layer that sees each page as it
  crosses the OPFS boundary.
- **IV/nonce management is the actual hard part.** The same page gets
  rewritten many times over a database's life (updates, vacuum, journal
  activity) — reusing a nonce for the same key is an AES-GCM catastrophic
  failure, not a theoretical concern. Design this explicitly (e.g. a
  per-page monotonic counter combined with a random per-database salt) rather
  than assuming a fresh random IV per write is automatically safe at this
  volume — it likely still is, but the birthday-bound math for how many page
  writes are safe under one key should be checked, not assumed, given
  `device-only` data can accumulate for years.
- **Only `device-only` callers get this treatment initially.** If leg 6's
  unified surface also routes `offline-first` plugins through the OPFS
  backend eventually, that tier's own no-presence key
  (`offline-device-key.ts`) is a separate, independent secret from the
  Device Storage Key — do not let the two crypto paths merge just because
  they end up sharing a storage engine.

**Do not proceed if:** the live round-trip can't be verified end-to-end in a
real browser (see leg 7's own note on why this workstream's usual test
approach doesn't cover this). Landing an encryption layer that only "looks"
correct via a mocked test is exactly the RFC 0071 pattern this leg exists to
avoid repeating.

### Leg 9 — Native SQLCipher database · cross-repo (`sovereign-mobile`)

**Epic tasks:** 20.13 (completion — the actual database; the bridge
permission, protocol, and Keychain/Keystore key custody already shipped in
leg 4).

**Why this leg can run independently of legs 6–8:** it's a different repo,
a different platform (native, not web), and RFC 0093 already resolved the
one thing native and web share (key custody design) — SQLCipher does its own
page encryption natively, so this leg has none of leg 8's "design the
crypto" problem, only integration and migration work. It can be picked up in
parallel with legs 6–8, same as leg 4's own native/web split.

**Goal:** `@capacitor-community/sqlite`, with SQLCipher enabled, backs a real
`device-only` plugin's data on iOS and Android — encrypted database, unlocked
by the same Keychain/Keystore-gated key task 20.13 already ships (the
`secureStorage` capability's key-custody half). Verified with the same
honesty standard the rest of `sovereign-mobile`'s work this session used:
build-verified (`xcodebuild`, `:app:assembleDebug`) at minimum, a real
interactive round-trip on Simulator/Emulator if at all achievable in that
environment.

**Technical notes:**

- `sovereign-mobile`'s own epic doc entry for task 20.13 already states this
  gap plainly ("Not done: … the `@capacitor-community/sqlite` + SQLCipher
  database itself") — read that entry before starting, it has the current,
  authoritative status.
- The SQLCipher encryption key is not the Device Storage Key directly —
  follow RFC 0093 §2/§3's existing key-custody design for how the database
  key relates to the Keychain/Keystore-held key already shipped; don't
  re-derive this from scratch.
- Advertise `secureStorage`'s capability version bump (if the wire contract
  changes to reflect "database now backed for real," not just "key custody
  exists") consistent with workstream 0003's standing rule — a shell must
  never advertise a capability its build doesn't actually honor.

**Do not proceed if:** `@capacitor-community/sqlite`'s SQLCipher support
turns out to have a real gap against this platform's requirements (e.g. no
way to rotate the encryption key without a full re-encrypt, if that turns
out to matter for a re-enrolled passkey scenario) — that's a finding worth
surfacing against RFC 0093's own design, not silently working around.

> **Shipped scope, and what's still open (August 2026).** `@capacitor-community/sqlite`
> turned out to be unusable as designed here — its API is entirely JS-facing
> and this shell strips Capacitor's own bridge when showing remote content —
> so `sovereign-mobile` links the same underlying SQLCipher libraries
> directly instead (`SQLCipher.swift` SPM package on iOS,
> `net.zetetic:sqlcipher-android` + `androidx.sqlite:sqlite` on Android). See
> that repo's own `docs/epics/bridge.md` task 20.13 entry for the full
> account, including the genuine iOS/Android key-custody divergence (raw
> Keychain key vs. Android envelope encryption, since Keystore keys are
> non-extractable). `SecureDatabase.swift`/`SecureDatabase.java` are built
> and build-verified on both platforms and wired into the `secureStorage`
> dispatch, replacing the key-custody-only `SecureStorage.swift`/`.java` as
> the live handler.
>
> On the `sovereign` monorepo side, this leg also fixed two bugs that were
> silently blocking the whole capability from ever being reachable, neither
> caused by leg 9's own new code: `DeviceStorageKeySection.tsx`
> (`plugins/account`) called only the web/PWA-only status check, never
> branching to the bridge's `supports('secureStorage')`, so the UI entry
> point for this capability was unreachable on any native shell; and
> `device-only-kv.ts` (`packages/sdk`) — the actual plugin-data storage
> primitive, distinct from that status-check UI — was entirely OPFS/web-only,
> so even after the UI fix no `device-only` plugin could persist data
> natively. Both are fixed: `DeviceStorageKeySection.tsx` now dispatches
> between a native branch and the original web flow, and every function in
> `device-only-kv.ts` (`get`/`set`/`delete`/`list`/`clear`) now routes
> through the native `secureStorage` bridge when `supports('secureStorage')`
> is true, falling through to the existing OPFS logic otherwise —
> deliberately excluding `listDeviceOnlyPluginIds()`, which has no bridge
> equivalent and whose only caller (full export/import) is already
> web-only. The `example-device-only` reference plugin now proves the whole
> stack end to end on iOS: a note written through the native path survives a
> full force-kill and relaunch of the app.
>
> **iOS verified interactively; Android is not, and the gap is
> environment-specific.** On iOS, a real UI-driven `secureStorage.set`+`get`
> round-trip succeeded on the Simulator via Account → Security's "Verify it
> works" control, and the reference plugin's persistence-across-relaunch
> check passed. On Android, the same UI path reaches a real credential-
> confirmation dialog once a device credential is configured (correctly
> reporting `'no-device-auth'` beforehand, and `'dismissed'`/`'cancelled'`
> from the real dialog after — both materially different, correct results
> from the dispatch layer working) — but this specific AVD image
> (`sovereign-edge`, emulator 37.1.11) reproducibly wedges its SystemUI when
> interacting with PIN/credential screens, requiring a hard kill and restart
> each time, across multiple independent attempts. Genuine on-device testing
> (tracked as still-needed, matching `docs/pwa-real-device-testing.md`'s note
> for the web side) is the way to settle the Android `ok` path conclusively;
> repeated emulator crashes made further attempts here an unproductive use
> of time rather than a code question. Leg 9 stays 🚧 partial for this
> reason alone — everything else in its scope is shipped and verified.

### Leg 10 — Layer 3 escrow: opt-in encrypted server backup

**Epic tasks:** 8.21 (completion — RFC 0093 §4's Layer 3; Layers 1 and 2
already shipped in leg 4).

**Why this leg is independent of legs 6–9:** Layer 3 backs up the _wrapped
key material_, not the underlying data — it has no dependency on which
storage engine (`device-only-kv.ts` or a future relational one) actually
holds a plugin's records. It could run before, after, or interleaved with
legs 6–9 without conflict.

**Goal:** the three-gate opt-in cascade RFC 0093 §4 specifies — `.env` flag
(hard kill switch) → Console toggle (`platform:owner`/`platform:admin`) →
per-plugin per-user opt-in — reusing RFC 0060's existing wrapped-key
server-storage pattern (the server stores ciphertext it cannot read; a
recovery secret unwraps it), not a parallel system.

**Technical notes:**

- **Flag Docker-config impact immediately**, per this repo's own standing
  rule — a new `.env` var needs `.env.example` + `docs/self-hosting.md`
  entries in the same PR, and the `docs-parity.test.ts` one-directional
  check only catches the `.env.example` → docs direction, not the reverse.
- Reuses RFC 0060's wrap/recovery-secret machinery (`e2ee-crypto.ts`'s wrap
  functions) for the _pattern_, not the _secret_ — RFC 0093 §3 is explicit
  that `device-only`'s recovery secret is cryptographically independent of
  RFC 0060's CMK recovery secret. Do not let this leg quietly merge the two.
- With no `.env` flag set (the default), an instance must behave exactly as
  if Layer 3 didn't exist — Layers 1 and 2 stay unconditional. This is
  already a locked decision (workstream 0008's own "Decisions locked"
  table), not open for reconsideration in this leg.

**Do not proceed if:** the Console toggle or per-plugin opt-in design can't
cleanly express "opted in, then opted back out" without leaving orphaned
server-side ciphertext for a plugin the user no longer trusts with backup —
that's a real data-handling gap worth resolving before implementation, not
after.

## Risks

- **The shared-device guarantee is the hardest constraint and the easiest to get
  subtly wrong.** `docs/architecture-rules.md:344` exists because a cached
  authenticated shell replayed for the wrong user is a serious breach. Leg 2 must
  be reviewed adversarially, not merely tested.
- **`device-only` promises privacy by removing the safety net.** No server copy
  means no restore. Until escrow is decided, every `device-only` decision is
  provisional.
- **iOS discards in-memory JS state across backgrounding; Android does not**
  (research 0008). A design assuming uniform behaviour is wrong on one platform.
- **Storage eviction is not hypothetical.** WebKit deletes script-created data
  after seven days without interaction for non-installed origins. Only native
  storage escapes this.
- **Leg 4 spans three repositories**, so the platform-side contract must land
  before either shell implements against it, and a shell must never advertise a
  `capabilities` entry its build does not honor. Workstream 0003 hit both of
  these; its leg 3/4 notes are the reference.
- **This is the third shape change to the manifest `offline` field** (object →
  boolean → enum). Each costs plugin authors. Get it right and carry the note.
- **Encryption surfaces here have a track record of looking more finished than
  they are.** RFC 0071 needed three hardening passes including a production
  incident (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`). Budget
  leg 4 accordingly and require a live round-trip against real data.
- **Next.js 15.5 → 16 is adjacent but not required.** `useOffline` detects
  "connected to Wi-Fi with no upstream internet", which `navigator.onLine`
  cannot, and its Server Action retry overlaps the sync queue. Sequence it
  deliberately rather than letting it arrive mid-workstream.
- **Legs 7–8 are genuinely novel for this codebase, not a variation on an
  existing pattern.** Nothing here has run SQLite-in-a-Worker or a custom
  encrypting VFS before. Budget for the architecture itself needing
  iteration, not just its plugin-facing API.
- **The usual verification approach (a hand-rolled fake plus real WebCrypto)
  does not cover legs 7–8.** A real SQLite engine with a custom VFS cannot be
  meaningfully faked in Node/vitest the way OPFS-as-a-file-map or
  IndexedDB-as-a-Map could be. These legs need actual browser verification
  (Playwright, or careful manual checks via the preview/browser tools) — a
  green unit-test suite alone is not evidence these legs work.
- **IV/nonce reuse in leg 8's page-encryption scheme is a silent-failure
  risk, not a loud one.** Get the per-page nonce scheme wrong and nothing
  crashes — the confidentiality guarantee just quietly doesn't hold. This is
  exactly the shape of bug RFC 0071's incident history warns about; design
  and review it as carefully as that history suggests.
- **Leg 9 lives in `sovereign-mobile`, a separate repo this session's agent
  had access to but a future one may not.** Confirm repo access before
  starting leg 9, the same prerequisite leg 4 needed.

## Kill criteria

**Stops the workstream:**

- Per-user cache partitioning cannot be made robust for the shared-device case
  (leg 2). Cold-start offline is then unreachable without weakening a security
  guarantee, and that trade is not available.
- The escrow question cannot be answered in a way the project is willing to ship.
  `device-only` is then not viable and the workstream reduces to tiers 1–2 —
  legs 1, 2, 3 (minus `device-only`) and 5 still stand.
- Leg 7's real-browser spike shows `OPFSCoopSyncVFS` performs unacceptably, or
  the Worker-messaging overhead makes routine queries noticeably slow. Legs
  8–10 (and any future migration of `device-only-kv.ts` onto a relational
  store) are then not viable as designed — `device-only-kv.ts`'s simpler
  key/value shape becomes this platform's permanent web answer, not a
  stopgap, and that's a real product-scope finding worth surfacing rather
  than working around.

**What survives if it dies partway:**

- After leg 1: the documentation record is accurate regardless.
- After leg 2: cold-start offline for the shell and launcher — the single largest
  user-visible win here — stands alone without any tiering work.
- After leg 3: the tiered manifest and storage abstraction are useful for
  `offline-first` plugins even if `device-only` never ships.
- After leg 4: `device-only` is fully viable for the common case — key/value
  data, no queries or joins — via `device-only-kv.ts`, with real key custody,
  re-lock enforcement, and a working escrow floor (Layers 1–2). Nothing in
  legs 6–10 is required for `device-only` to be genuinely usable; they raise
  its ceiling (real SQL, native SQLCipher, opt-in server backup), they don't
  unblock its floor.
- After leg 5: `offline-first` is complete as a tier without `device-only`
  existing at all.
- After leg 6: plugin authors get one unified API shape across backends even
  if leg 7's relational engine never lands — IndexedDB and native SQLite both
  work standalone.
- After leg 9: `device-only` plugins on native get a real relational database
  even if the web engine (legs 7–8) never ships — the two platforms don't
  depend on each other.
- After leg 10: Layer 3 stands alone as a genuine escrow improvement
  regardless of which storage engine underlies a plugin's data.

Each leg is drawn to leave shipped, coherent value behind. A stop at any boundary
leaves the platform better than it started, not half-migrated.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft from research 0012, governed by it directly under the research-as-design exception. Five legs, 11 epic tasks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0.2     | August 2026 | Leg 3 is no longer a gate — workstream 0003's leg 4 outcome already answers the delivery-model question empirically. Leg 4 split across `sovereign-mobile`/`sovereign-desktop`; task 20.13 rescoped to not duplicate task 17.4 / 0003 leg 3b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.3     | August 2026 | Leg 4's escrow and key-strictness decisions made — [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md), Accepted. Leg 4 is no longer a workstream gate; ready to prioritize and implement. Leg 4's design now lives in RFC 0093, not directly in research 0012 — the research-as-design exception's "no RFC" framing now applies to legs 1/2/3/5 only.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 0.4     | August 2026 | Leg 4 shipped its key-custody/session/escrow-Layers-1-2 scope (web WebAuthn PRF + native Keychain/Keystore, re-lock enforcement, encrypted export/import, a reference plugin) across several PRs — its real size only became clear during execution, same as task 3.37 did in leg 3. The remaining scope — the real relational storage engines RFC 0093 §1 specs (`wa-sqlite` on web, SQLCipher on native), their encryption, and Layer 3 escrow — is carved out into new legs 6–10, documented here rather than implemented, at the goal owner's request: a properly-scoped plan for a future session, not a same-session build. Leg 7 (the web engine) and leg 8 (its encryption) are each marked a gate — see their own "why this leg is a gate" notes. Added corresponding risks and kill-criteria entries. |
| 0.5     | August 2026 | Corrected drift between the Definition of done checklist and this doc's own leg-detail sections: 6 of 10 items were still unchecked despite the corresponding leg text describing them as shipped and verified (cold-start offline, the shared-device replay regression test, the manifest enum, both tiers' at-rest encryption via the currently-shipped backends, key-custody enforcement, and both superseded-RFC/upgrade-note requirements). Reworded the session-expired item to match what actually shipped (a login-page notice, not a separate page) rather than the originally-envisioned mechanism. Also fixed the header `RFCs:` field, which read "none" while the callout directly beneath it names RFC 0093 as governing leg 4 — now lists it explicitly, scoped to that leg.                     |
