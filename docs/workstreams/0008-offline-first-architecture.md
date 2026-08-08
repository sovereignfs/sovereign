# Workstream 0008 — Offline-first architecture

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Goal owner:** kasunben\
**RFCs:** none — governed directly by research 0012 under the
[research-as-design exception](../documentation-structure.md)\
**Epics touched:** 1 (Users & Auth), 2 (Platform Shell), 3 (Plugins Runtime),
8 (Data Sovereignty), 20 (Mobile)\
**Research:** [0012](../research/0012-offline-first-architecture.md)
(supersedes [0009](../research/0009-offline-database-architecture.md); builds on
[0008](../research/0008-wkwebview-android-webview-offline-spike.md))

> **Why there is no RFC.** Research 0012 already carries the settled design:
> the options were weighed, the choices made, and the rejected alternatives
> recorded. An RFC restating them would add a review cycle without adding a
> decision. This is the first use of the research-as-design exception documented
> in [documentation-structure.md](../documentation-structure.md); its four
> conditions are met — rejected alternatives are written down, the one genuinely
> open decision (escrow) is an explicit gate on leg 4, the decisions are carried
> forward in the table below, and both this document and the epic tasks cite
> research 0012 where they would otherwise cite an RFC.

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

- [ ] A returning user can cold-launch the installed PWA or native shell with
      **zero connectivity** and land on their home screen — not a white screen,
      not the generic `/offline` page.
- [ ] A user whose session has expired sees a purpose-built Offline page
      explaining they need a connection to sign in — **not** a login form that
      cannot work, and **not** an unlocked cached shell.
- [ ] Airplane mode is **not** an authentication bypass: the gate is a valid
      local session, plus device auth for `device-only` plugins.
- [ ] A cached authenticated document can never be served to a different user on
      a shared device, with a regression test proving it.
- [ ] Plugins declare `offline: 'offline-first' | 'device-only'`; omitting the
      field means no offline support, and that remains the default.
- [ ] `offline-first` plugins read and write locally and sync in the background;
      `device-only` plugins never send data to the server.
- [ ] Offline data is encrypted at rest in **both** offline tiers.
- [ ] `device-only` plugins cannot be enabled without device auth enrolled, and
      that is enforced by key custody, not a UI check.
- [ ] The escrow/recovery position is decided, documented, and implemented.
- [ ] RFC 0074 and RFC 0078 are marked superseded, with a `docs/upgrade.md`
      migration note for the manifest change.

## Decisions locked

Settled by research 0012. Not to be reopened mid-execution.

| Decision                    | Choice                                                                                 | Rejected alternative and why                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall model               | Offline-first — device holds a real copy, network makes it fresh                       | Harden the current online-first model: cannot deliver cold-start offline, durable storage, or a device-only tier at all.                                                            |
| Tier count                  | Three: none (default) / `offline-first` / `device-only`                                | One uniform tier — most plugins do not need it, Console and Settings arguably should _not_ work offline, and forcing it on every author is hostile.                                 |
| Tier gating                 | **Capability detection** — is a durable, encrypted, device-auth-gated store available? | `sdk.device.getSurface()` — documented in `docs/sdk-stability.md:65` as a presentation hint, never a security boundary, and trivially spoofable. Would also bake in today's limits. |
| Manifest shape              | `offline: z.enum(['offline-first', 'device-only']).optional()`                         | Keeping `offline: boolean`; adding an explicit "off" literal (reintroduces the ambiguity RFC 0078's flattening removed); naming it `offline-only` (reads badly).                    |
| `offline:write` permission  | Dropped — the enum is sufficient install-review signal                                 | Keeping it: redundant once both tiers imply local mutation. Dropping it also resolves RFC 0074's open question 1.                                                                   |
| Encryption scope            | Both offline tiers encrypt at rest; tiers differ only in **what guards the key**       | Encrypting only `device-only` — leaves tier-2 data plaintext and misleads authors who reasonably assume "offline data is protected".                                                |
| Device auth mechanism       | **Key custody** — the OS releases the key after auth; data on disk is ciphertext       | A UI gate that flips `unlocked = true` in JS — an attacker reads storage directly and never runs our code. Security theater.                                                        |
| Device auth definition      | Biometric **or** device passcode, against the same hardware-backed key                 | Biometric-only — locks out every user who has not enrolled a face or finger.                                                                                                        |
| `device-only` enrolment     | Structural: enabling the plugin _is_ the enrolment; no preference exists               | A user-facing toggle — creates a state to enforce and to drift out of sync.                                                                                                         |
| Offline session             | A separate, explicitly-scoped, long-lived offline assertion                            | Raising `cookieCache.maxAge` (`apps/auth/src/auth.ts:56`) — that 300s value correctly bounds role-change staleness for _online_ requests.                                           |
| Offline login behaviour     | Remove the login **form**; keep the session **check**                                  | Unlocking the cached shell on "offline" alone — makes airplane mode an authentication bypass on a stolen device.                                                                    |
| Service-worker caching rule | Rewrite it to state its **requirement**, not its mechanism                             | Leaving it as-is — nothing else can serve a document with no network, and Next.js 16.3's `useOffline` explicitly does not close that gap.                                           |
| Sync engine                 | Build it; keep RxDB as a fallback if it proves larger than expected                    | PowerSync (FSL-licensed service, separate Docker dep, Postgres-oriented); ElectricSQL (Postgres-only, read-path only); Zero (offline explicitly out of scope per its own authors).  |
| Conflict resolution         | Last-write-wins timestamps, as RFC 0078 already uses                                   | CRDTs (Yjs/Automerge/Loro) — they solve concurrent multi-writer editing; Sovereign's data is predominantly single-writer-per-record. Decided against explicitly.                    |

**Deliberately still open**, each an explicit gate below:

| Open decision                                    | Resolved by | Owner    |
| ------------------------------------------------ | ----------- | -------- |
| Escrow and recovery for `device-only` data       | Task 8.21   | kasunben |
| Whether key strictness is manifest-declared      | Task 8.21   | Platform |
| Whether revocation should reach device-only data | Task 8.21   | kasunben |

**Closed since the initial draft:** whether `device-only` needs a different
delivery model. Workstream 0003's leg 4 outcome answers it — the bridge reaches
the remote instance origin on both platforms, and native storage is not
origin-partitioned. See leg 3 detail.

## Prerequisites

| Prerequisite                                                                   | Owner    | Status                                            |
| ------------------------------------------------------------------------------ | -------- | ------------------------------------------------- |
| Service worker installs for logged-out visitors (`worker-` allowlist)          | Platform | ✅ Done — `2ac31cf`                               |
| Research 0008's Android misattribution corrected                               | Platform | ✅ Done — same commit                             |
| Research 0009 marked superseded                                                | Platform | ✅ Done                                           |
| **Escrow/recovery position chosen** — encrypted backup, export, or accept loss | kasunben | ⛔ **Open — gates leg 4.** Not an agent decision. |

## Legs

| Leg | Name                        | Epic tasks              | Epics    | Gate?   | Done when                                                                       |
| --- | --------------------------- | ----------------------- | -------- | ------- | ------------------------------------------------------------------------------- |
| 1   | Record correction           | —                       | —        | No      | The four documentation-drift items are fixed; the record matches reality.       |
| 2   | Cold-start offline shell    | 1.21, 2.31, 2.32        | 1, 2     | No      | A cold launch with no connectivity reaches the home screen or the Offline page. |
| 3   | Tiered plugin offline model | 3.36, 3.37, 2.33        | 2, 3     | No      | Tiers ship; `device-only` availability follows bridge capability.               |
| 4   | Encryption and device auth  | 8.21, 20.13, 8.20, 1.22 | 1, 8, 20 | **Yes** | Offline data is encrypted in both tiers; `device-only` unlocks by device auth.  |
| 5   | Background sync             | 3.38                    | 3        | No      | An offline write reaches the server after reconnect, exactly once.              |

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

**Epic tasks, in execution order:** 1.21 → 2.31 → 2.32.

**Why this leg is first among the implementation legs:** it depends on nothing
else, delivers the headline requirement, and is the only leg that must revise a
hard architectural rule. It is also the largest standalone user-visible win here
and stands on its own if the workstream stops afterwards.

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

### Leg 3 — Tiered plugin offline model

**Epic tasks, in execution order:** 3.36 → 3.37 → 2.33.

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

### Leg 4 — Encryption and device auth · **GATE** · cross-repo

**Epic tasks, in execution order:** 8.21 → 20.13 → 8.20 → 1.22, with the two
native transport halves owned by the shell repos (see split below).

**Blocked on:** the escrow decision. Task 8.21 leads the leg precisely because
everything after it branches on the answer. Do not start this leg before the
decision is made.

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

**Technical notes:** passkeys are already deployed
(`apps/auth/src/auth.ts:231`), so WebAuthn PRF builds on live infrastructure.
Apple does not pass PRF to external roaming authenticators on iOS, but platform
passkeys work — the case that matters. Native SQLite via
`@capacitor-community/sqlite` provides SQLCipher, so the work is key custody and
unlock UX, not cryptography. Current device permissions are only
`device:haptics` and `device:notifications`
(`packages/manifest/src/schema.ts:37-38`). Note workstream 0003's standing rule:
a shell's `capabilities` list must reflect what that build actually supports —
advertising a capability the transport does not implement is worse than omitting
it, because the caller's `unavailable` path never runs.

**Do not proceed if:** the escrow decision is still open, or the chosen option
needs a user-held recovery secret the design has no home for.

### Leg 5 — Background sync

**Epic tasks:** 3.38.

**Technical notes:** RFC 0078's `offline-queue` is a primitive — idempotent
enqueue plus a manual `drainQueue()` — not a sync engine. Its 500-entry hard cap
throws rather than evicting, deliberately; preserve that property.

**Do not proceed if:** the design implies a continuous bidirectional sync engine
substantially larger than the rest of this workstream combined. Research 0012
converged on network-first-with-local-fallback rather than continuous local-first
sync; if the design drifts there, stop and revisit.

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

## Kill criteria

**Stops the workstream:**

- Per-user cache partitioning cannot be made robust for the shared-device case
  (leg 2). Cold-start offline is then unreachable without weakening a security
  guarantee, and that trade is not available.
- The escrow question cannot be answered in a way the project is willing to ship.
  `device-only` is then not viable and the workstream reduces to tiers 1–2 —
  legs 1, 2, 3 (minus `device-only`) and 5 still stand.

**What survives if it dies partway:**

- After leg 1: the documentation record is accurate regardless.
- After leg 2: cold-start offline for the shell and launcher — the single largest
  user-visible win here — stands alone without any tiering work.
- After leg 3: the tiered manifest and storage abstraction are useful for
  `offline-first` plugins even if `device-only` never ships.
- After leg 5: `offline-first` is complete as a tier without `device-only`
  existing at all.

Each leg is drawn to leave shipped, coherent value behind. A stop at any boundary
leaves the platform better than it started, not half-migrated.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                        |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft from research 0012, governed by it directly under the research-as-design exception. Five legs, 11 epic tasks.                                                                                                                   |
| 0.2     | August 2026 | Leg 3 is no longer a gate — workstream 0003's leg 4 outcome already answers the delivery-model question empirically. Leg 4 split across `sovereign-mobile`/`sovereign-desktop`; task 20.13 rescoped to not duplicate task 17.4 / 0003 leg 3b. |
