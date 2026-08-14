# RFC 0093 — Device-only tier: key custody and data-loss recovery, native and web

**Status:** Accepted\
**Date:** August 2026\
**Author:** kasunben (design session with Claude Code)\
**Scope:** `packages/bridge` (new Capacitor secure-storage transport),
`packages/sdk` (device-client capability surface, WebAuthn PRF helpers,
`sdk.offline`'s native/OPFS backends), `packages/manifest` (new
`device:secureStorage` permission), `apps/auth` (PRF enrollment on the
existing passkey flow), `runtime` (Console operator toggle, `.env` gate),
`plugins/account` (enrollment/recovery UX), `docs/architecture-rules.md`,
`docs/plugin-development.md`. Resolves research
[0012](../research/0012-offline-first-architecture.md)'s Open Questions 1
(escrow) and 3 (key strictness) and elaborates its `device-only` key-custody
recommendation into a concrete design covering **both** native shells and
plain web/PWA. Builds on RFC [0083](0083-device-bridge-capability-contract.md)
(device bridge — adds a `secureStorage` capability to that contract) and
reuses RFC [0060](0060-client-side-encryption-core.md)'s (client-side
encryption core) recovery-secret and wrapped-key server-storage machinery for
the opt-in backup path. Directly informs epic tasks 8.21, 20.13, 8.20, 1.22
(workstream 0008 leg 4).\
**Incorporated into plan:** Yes — unblocks workstream 0008 leg 4, which was
gated on exactly the decision this RFC makes.

---

## Summary

Defines how a `device-only` plugin's data is actually stored and protected —
on a native shell (Capacitor) **and** on plain web/PWA — and what happens
when the key that protects it dies. Five decisions, previously open:

1. **Storage backend.** Native: SQLite, SQLCipher-encrypted, app-sandboxed —
   built directly against the SQLCipher native libraries, not the
   `@capacitor-community/sqlite` plugin originally named here; see "Resolved
   in v0.7" below for why. Web: OPFS + `wa-sqlite`
   (`OPFSCoopSyncVFS`), with `navigator.storage.persist()` requested at
   setup. Neither is IndexedDB, and the reason is the same on both:
   IndexedDB is evictable everywhere it was tested (research 0008).
2. **Key custody.** Native: Keychain (iOS) / Keystore (Android). Web:
   WebAuthn PRF, building on the passkey infrastructure already deployed
   (`apps/auth/src/auth.ts:231`). Both release the key only via a live
   biometric/passcode (or platform-authenticator) prompt each time — never a
   JS-side "unlocked" flag — and **both must accept a device passcode as a
   fallback, never biometric-only** (see section 5 — this corrects an error
   in this RFC's own first draft).
3. **One Device Storage Key, set up once, shared by every plugin.** Account →
   Security gets a new "Device Storage Key" section, parallel to RFC 0060's
   existing "Client-side encryption" section — same UX pattern,
   cryptographically independent secret, and a deliberately distinct name
   from RFC 0060's own existing (unrelated) internal "device key" concept
   (`e2ee-device.ts` — see "Current state"). Not triggered per-plugin; a
   plugin that finds it missing directs the user there rather than running
   its own enrollment.
4. **Surviving key invalidation short of device loss.** A second,
   independent recovery wrapper on the same underlying key, so a deleted
   passkey or an OS-level credential change doesn't destroy data by itself
   — only losing the device does.
5. **Escrow.** A three-layer, progressively-available recovery model,
   platform-agnostic, for the one failure mode the second wrapper can't
   cover: the device itself being lost, stolen, or wiped.

## Motivation

Research 0012 established that `device-only`'s entire reason to exist is
durable, encrypted, presence-gated local storage — and that IndexedDB
satisfies none of that on iOS, nor does it have a presence gate anywhere. It
also identified, without resolving, that a hardware-bound key is invalidated
by design under three circumstances (biometric re-enrollment, passkey
deletion, device loss), and left the resulting data-loss question as its one
deliberately unresolved open question: _"This is a product decision about
what Sovereign promises... it should be made explicitly before any RFC
commits to a design."_ It separately left key strictness (`biometryCurrentSet`
vs. `userPresence`) as an open tradeoff, despite its own text a few
paragraphs earlier already ruling one of them out on accessibility grounds.

Both decisions have now been made (design session, August 2026), for native
**and** web, plus concrete mechanisms to implement them against. This RFC
records all of it so tasks 20.13 and 1.22 (leg 4, previously blocked) have
something to build.

## Current state (what this builds on)

- `packages/sdk/src/offline.ts` — the existing plugin-scoped KV cache. Its
  doc comment explicitly scopes it "Browser-only"; it opens
  `indexedDB.open('sovereign-offline', 1)` unconditionally
  (`offline.ts:96-108`). This is the `offline-first`-tier mechanism and is
  **not** in scope for this RFC — it stays IndexedDB-backed everywhere.
- `packages/sdk/src/e2ee-device.ts` — RFC 0060's existing "Device Key"
  mechanism. Also IndexedDB-backed (`DB_NAME = 'sovereign-e2ee'`,
  `e2ee-device.ts:13-29`), and the stored `CryptoKey`, while
  non-extractable, is released to any script on the origin with no
  presence check (`getDeviceKey()`, `e2ee-device.ts:53-63`). Confirmed
  during this design session to be **insufficient as the `device-only`
  primary key** for two independent reasons: it inherits IndexedDB's
  eviction risk, and it has no live-auth gate. Its recovery-secret
  machinery remains a good fit for a _different_ piece — see section 4.
- `packages/sdk/src/device-client.ts:124-126` — `isDeviceOnlyTierAvailable()`
  already exists, gated on `supports('secureStorage')`, and already returns
  `false` everywhere pending exactly the bridge capability this RFC's
  design informs.
- `apps/auth/src/auth.ts:231` — better-auth's `passkey()` plugin is already
  configured and live. WebAuthn is deployed today; PRF is an extension on
  top of infrastructure that already exists, not a new subsystem.
- RFC 0083 defines the device bridge capability contract generally
  (`haptics`, `notifications`, etc.); this RFC's native design is a new
  capability (`secureStorage`) on that same contract, not a new mechanism.
- RFC 0060 (`e2ee-crypto.ts`/`e2ee-object.ts`/`e2ee-device.ts`) already
  implements a Client Master Key wrapped by a user-held recovery secret,
  with the wrapped (ciphertext) CMK stored server-side and a documented
  Account UX for setup, unlock, and recovery-secret handling. Its threat
  model and recovery shape (server holds ciphertext it cannot read; a
  recovery secret unwraps it) is exactly the shape this RFC's opt-in
  escrow layer needs — reused, not reinvented.
- Epic task 1.22 (`docs/epics/users-auth.md:974-1011`) already specifies
  "Web/PWA: WebAuthn PRF key derivation... Native: key stored via task
  20.13's `device:secureStorage` bridge, with user-presence access control
  (biometric **or** device passcode — never biometric-only)" and was
  gated on task 8.21 (the escrow decision) until this RFC resolved it.
  This RFC's design is that task's own scope, made concrete — not new
  scope invented here.
- Workstream 0008 leg 4 (`docs/workstreams/0008-offline-first-architecture.md`)
  was marked a workstream **gate** while this decision was open, and already
  named `@capacitor-community/sqlite` (SQLCipher) as the native storage pick
  and `secureStorage` as the permission name. This RFC's acceptance lifts
  that gate — see the workstream doc's own changelog.

## Proposed design

### 1. Storage backend

**Native (Capacitor):** a SQLCipher-encrypted SQLite database, one database
per instance (not per plugin — mirrors `sdk.offline`'s existing
shared-database, composite-key-per-plugin shape, so the storage layer's
schema and isolation model don't have to be reinvented, only its backend
swapped). Lives in the app's sandboxed storage — outside `WKWebsiteDataStore`
on iOS, so it is not subject to the storage-pressure/non-interaction
eviction policy IndexedDB is. **Not** reached via `@capacitor-community/sqlite`
as originally named here — see "Resolved in v0.7" under Open questions: that
plugin's entire API is JS-facing and unreachable from this shell's bridge
-isolated remote content, so `sovereign-mobile` links the same underlying
native SQLCipher libraries directly instead.

**Web/PWA:** OPFS via `wa-sqlite`'s `OPFSCoopSyncVFS` — research 0012's own
"2026 production pick for the web," chosen specifically because it does
**not** require COOP/COEP headers (the official `sqlite-wasm` OPFS build
does, and those headers would fight this platform's CSP). At `device-only`
enrollment, the browser is asked for `navigator.storage.persist()`. This
is a request, not a guarantee — see "What web cannot fully match," below.

Both backends are reached through the same plugin-facing shape (this RFC
does not redesign that surface — see task 3.37, "Unified offline storage
SDK surface," already scoped separately). `isDeviceOnlyTierAvailable()`
(`device-client.ts`) checks both independently — a native
`secureStorage`-capable transport, or web/PWA's own WebAuthn PRF + OPFS
support — and is `true` if either is present. A plugin declaring
`device-only` on a surface with neither sees `isDeviceOnlyTierAvailable()
=== false` and the existing capability-restricted UI treatment (research
0012, shipped in leg 3) applies — no manifest change, no plugin-visible
branching.

**Interim key/value primitive, stated plainly:** `device-only-kv.ts` implements
a smaller piece of this today, across both backends — not the `wa-sqlite`
relational engine described above (a plugin needing actual SQL, joins,
indices, or cross-record queries is not served by it), but durable, encrypted,
per-record storage with no query needs, which is the more common case. Each
function (`get`/`set`/`delete`/`list`/`clear`) checks `supports('secureStorage')`
first: **native** routes straight through the bridge's `secureStorage`
capability — `sovereign-mobile`'s SQLCipher database is already the
encryption boundary, so no second, app-level encryption layer runs on this
path; **web/PWA** falls through to the AES-GCM-encrypted-over-OPFS
implementation (one file per key, per plugin) using the unlocked Device
Storage Key from `device-only-session.ts`, as originally shipped. One
exception: `listDeviceOnlyPluginIds()` (enumerate every plugin with
`device-only` data, not a single plugin's own keys) stayed OPFS-only — the
`secureStorage` wire protocol has no "list all plugin ids" operation, only
per-plugin-scoped ones, and its only caller (`device-only-export.ts`'s full
export/import, RFC 0093 §4 Layer 2) is itself web-only for the same reason,
so the gap is already masked in practice. See `docs/plugin-development.md`'s
`device-only` tier section for the plugin-facing API, and
`example-plugins/example-device-only` for a plugin exercising both backends
end to end, including its own transport-specific gating (see "Resolved in
v0.7 (continued)" under Open questions).

### 2. Primary key custody

**Native:** the SQLCipher database key (a 256-bit symmetric key) is
generated on-device and held in:

- **iOS:** Keychain, with `kSecAccessControlUserPresence`.
- **Android:** Keystore, with `setUserAuthenticationRequired(true)` (device
  credential enabled as an accepted authenticator type, not
  biometric-only).

Release requires a live biometric-**or**-passcode prompt, subject to the
re-lock policy below. Implemented as a new `secureStorage` capability in
`@sovereignfs/bridge`'s Capacitor transport, calling through a thin custom
bridge written directly against `LocalAuthentication`/`BiometricPrompt` +
Keychain/Keystore — see "Resolved in v0.6" under Open questions for why no
third-party plugin was adopted. `sdk.device.*` never talks to
Keychain/Keystore directly; it calls the bridge capability, matching every
other native capability in RFC 0083's contract.

Android Keystore keys are non-extractable by design — there is no route to
the raw key bytes this section describes for iOS's Keychain. `sovereign-mobile`
resolves this with envelope encryption: a `SecureRandom`-generated database
key is wrapped by an authentication-gated Keystore AES key and the ciphertext
lives in `SharedPreferences`, unwrapped via `Cipher.init()` on every use —
still authentication-gated, so the property this section actually requires
(release of the key is gated) holds identically; only the storage mechanics
differ. See that repo's own `docs/epics/bridge.md` task 20.13 entry for the
full implementation detail on both platforms.

**Web/PWA:** WebAuthn's PRF extension, via `navigator.credentials.get()`
against the user's existing passkey. If the existing credential doesn't
support PRF, the enrollment flow registers a **new** passkey with the
extension explicitly requested — it does not assume the login passkey can
be reused (matching task 1.22's own note). The derived output is used
directly as (or to derive, via HKDF) the OPFS database's encryption key.
Same property as native: the secret backing it never leaves the platform
authenticator (frequently the same Secure Enclave/StrongBox chip Keychain/
Keystore use), and it can only be reproduced by repeating the ceremony —
live proof, every time.

**Where and when setup happens (resolved): centralized in Account →
Security, once, decoupled from any single plugin.** Not triggered inline
the first time a user opens _some_ `device-only` plugin. Account → Security
gets a new **"Device Storage Key"** section, alongside the existing
"Client-side encryption" (RFC 0060) section — same UX pattern (setup,
recovery-secret display, settings), same location, but a cryptographically
**independent** secret from RFC 0060's CMK (see section 3 — considered and
deliberately rejected sharing the two), and a deliberately distinct name
from RFC 0060's own existing, unrelated internal "device key" concept
(`e2ee-device.ts`). Set up once, the resulting key is shared by **every**
`device-only` plugin the user has or later gets access to — not one key
per plugin, matching the storage model in section 1, which was already one
database per instance, never one per plugin.

A `device-only` plugin that finds no Device Storage Key set up does not run
its own enrollment ceremony inline — it shows a message directing the user
to Account → Security and stops there. This is a deliberate decoupling from
plugin access: a plugin's install/access-policy lifecycle (who can open it
at all — an entirely separate, existing mechanism, RFC 0065) has nothing to
do with whether that user's Device Storage Key exists yet. Revoking and
later re-granting a user's access to a plugin does not touch their Device
Storage Key or its data either way — the two lifecycles don't interact.

**PRF salt and versioning (resolved).** A single fixed salt constant,
scoped to exactly this purpose and derived from a descriptive string
(e.g. `sha256("sovereign:device-only-storage:v1")`, not a hand-picked hex
literal, so it stays auditable) — never a per-user or random salt; the
salt's only job is domain separation between different _purposes_ using
the same passkey, not between users, and the credential's own hardware
secret already supplies the actual security. This matters concretely if
RFC 0060's own CMK ever adopts PRF unlock too: a different, equally fixed
salt for that purpose guarantees the two derived keys are cryptographically
independent, so a compromise of one context can never imply the other. A
version tag travels with the wrapped-key ciphertext, matching RFC 0060's
own "explicit algorithm/version metadata stored with each encrypted
object" convention, so a future scheme change doesn't strand already-
enrolled users.

**Re-lock policy (resolved): timed, by default, with a user override.**
Neither "per launch" nor "every open" alone, and the choice is sharpened
by a finding from this platform's own WKWebView testing (research 0008/
0012, epic task 20.10): iOS discards the entire JS execution context on
backgrounding — a fresh reload every time the app returns to foreground —
while Android WebView preserves it. That means "unlock once per launch"
is **already, accidentally, "unlock every open" on iOS** (free security
from a platform quirk) but genuinely **"unlock once, stay unlocked
indefinitely while backgrounded"** on Android, with nothing forcing
re-authentication. Same nominal policy, two different real guarantees per
platform — not an acceptable place to leave an implicit inconsistency.
Default: re-lock after a timed window of the app being backgrounded (or
immediately on backgrounding — the exact duration is an implementation
detail, not a design question), applied deliberately on **both**
platforms rather than relying on iOS's behavior to cover for a policy
that doesn't actually specify it. User-adjustable in Account settings —
stricter (immediate) to more lenient (a longer window) — matching
research 0012's own "default plus a user override" framing. Applies
identically to native and web.

On web, the preference (`device-only-storage.ts`'s `saveReLockPolicy`/
`loadReLockPolicy`) and its enforcement are deliberately separate modules:
`device-only-session.ts`'s `getUnlockedDeviceStorageKey()` holds the
unwrapped key in memory only for the caller's process lifetime, comparing
elapsed wall-clock time against the chosen window on each access rather than
relying on a timer to fire while backgrounded (browsers throttle or suspend
those unreliably) — see that module's own doc comment for the full
reasoning, including why a discarded JS context (iOS's behavior above)
self-enforces even more strictly than the policy requires rather than
needing separate handling. On native, the equivalent enforcement is
Keychain/Keystore's own access-control window (`SecureStorage.swift`'s
`reuseWindow`/`sovereign-mobile`'s `SecureStorage.java` key-validity
duration) — see task 20.13.

**Explicitly rejected: a JS-side PIN or "unlocked" flag as the gate, on
either platform.** A PIN that merely sets a boolean in app state is bypassed
entirely by reading raw storage — the check is never in an attacker's path.
A PIN that actually wraps the key (ciphertext-at-rest, not a flag) is
stronger but has no hardware-enforced rate limiting: an attacker who
extracts the database can brute-force a human-length PIN offline, unlimited
attempts, no lockout. Only a hardware-backed access-control primitive
(Keychain/Keystore, or WebAuthn's platform authenticator on web) closes
that gap. Any future proposal to add a PIN-only fallback for convenience
should cite this section rather than re-litigate it from scratch.

**Explicitly rejected: plain WebAuthn (no PRF) as a client-side gate.** A
plain WebAuthn assertion is a signed yes/no proof meant for a relying
party to verify — it does not itself hand back usable key material. Gating
a local decrypt on "did the assertion succeed" while the actual key sits
statically in local storage is the same theater problem as the JS-flag
case above: an attacker reading raw storage never has to pass the check.
PRF is what makes the ceremony produce something actually usable as a key.

### 3. Surviving key invalidation short of device loss

A hardware-bound key can stop working without the device being lost:
a passkey gets deleted (web), an OS credential change invalidates a
Keychain/Keystore item in ways that vary by exact configuration and OS
version, or (independent of the `userPresence`-equivalent choice in
section 5 surviving _most_ biometric re-enrollments) some platform
combination doesn't. Without a second path, any of these destroys
`device-only` data even though the device itself is still in the user's
hands — clearly unacceptable for the passkey-deletion case, which is a
hard, unconditional break with no "survives it" equivalent.

Standard key-slot design (the same shape LUKS and FileVault use) solves
this cheaply on both platforms: the actual database key is wrapped
**twice**, independently:

- **Wrapper 1 (daily use):** the Keychain/Keystore or WebAuthn-PRF key, as
  above.
- **Wrapper 2 (recovery):** a recovery secret, reusing RFC 0060's _existing_
  recovery-secret generation, display, and re-entry UX
  (`plugins/account/app/_components/EncryptionSection.tsx` and
  `e2ee-crypto.ts`'s wrap/unwrap primitives) rather than building parallel
  cryptographic machinery. **Resolved: this is a separate, independent
  secret from RFC 0060's own CMK recovery secret — not the same one.**
  Enabling a `device-only` plugin never requires touching e2ee setup, and a
  breach of one recovery secret does not expose data protected by the
  other. This does cost a user who adopts both features a second phrase to
  keep track of; that cost is accepted deliberately rather than merging the
  two systems' blast radius for the sake of one shared secret being
  marginally easier to manage than two — the entire reason `device-only`
  is its own tier, distinct from `offline-first`, is to keep a class of
  especially sensitive data walled off, and a shared recovery secret would
  quietly undo part of that separation. The recovery secret is shown once,
  when the Device Storage Key is set up in Account → Security (see section 2's
  "Where and when setup happens"), and the user is told to save it, exactly
  as RFC 0060 already does for its own CMK — same UX pattern, different
  secret, different section of the same page.

Both wrappers protect the _same_ underlying database key — two independent
doors to one room, not two copies of the data. When wrapper 1 stops working
(passkey deleted, Keychain/Keystore item invalidated), the app detects this
and prompts for the recovery secret to re-derive the key via wrapper 2;
once unlocked, a fresh wrapper 1 is generated and the recovery secret isn't
needed again until the next such event. No data is re-encrypted or moved —
only the key's wrapping changes.

This does **not** resolve "device lost or wiped" — if the recovery secret
only ever existed on that same device (memorized, or written down and also
lost), losing the device loses both wrappers together. That is what the
escrow layer below is for.

### 4. Escrow: recovering from device loss

Three layers, available progressively, platform-agnostic:

**Layer 1 — mandatory, always shown.** At `device-only` enrollment, before
any data is committed, a plain-language warning: what device-only means,
that losing the device with no recovery secret saved means permanent,
unrecoverable loss, stated as the tier's defining property, not an edge
case buried in settings.

**Layer 2 — always available, no toggle.** User-driven export: an encrypted
file (never plaintext) the user can generate on demand and re-generate
after changes, importable to restore on a new device. No server
involvement at all — this exists regardless of the toggle in Layer 3, and
answers device-to-device migration for a user who doesn't want any
server-side footprint whatsoever.

Implemented as `device-only-export.ts`'s `exportDeviceOnlyData`/
`importDeviceOnlyData` — a full snapshot of every plugin's
`device-only-kv.ts` data in one encrypted file per call, wrapped under a
user-chosen passphrase with the same PBKDF2/AES-GCM shape section 3's
recovery-secret wrapper uses (a different passphrase and a different
purpose, not the same secret). Import re-encrypts each value under the
_importing_ device's own unlocked Device Storage Key rather than copying
ciphertext across devices — the exporting and importing devices' keys are
never the same secret. See `docs/plugin-development.md`'s `device-only` tier
section for the plugin-facing note (plugin authors don't call this
themselves; Account → Security's export/import action does).

**Layer 3 — opt-in, three-gate cascade.** Encrypted server backup, reusing
RFC 0060's wrapped-key server-storage pattern (the server stores ciphertext
of the recovery-wrapped key; it never receives the key or the recovery
secret in the clear). Available only when all three gates are open:

1. **`.env`** — an instance-level flag the operator must set before the
   capability exists at all for that instance (the hard kill switch,
   consistent with how other sensitive opt-in features are gated in this
   codebase).
2. **Console** — once the env allows it, `platform:owner`/`platform:admin`
   decides whether this instance offers it, at all, to any user.
3. **Per-plugin, per-user opt-in** — even with both gates open, each user
   decides per `device-only` plugin whether that plugin's data gets backed
   up.

With no env flag set (the default), an instance behaves exactly as if
Layer 3 didn't exist — Layers 1 and 2 are unconditional and unaffected.

### 5. Key strictness: `userPresence`-equivalent, required, one setting for everyone

**Correction from this RFC's first draft.** That draft specified
`kSecAccessControlBiometryCurrentSet` (biometric-only, invalidated on any
enrollment change) as the native access-control flag. That is wrong and is
corrected here: research 0012 itself already states, a few sections before
its own "open question" framing of this exact tradeoff, _"Call it device
auth, not biometric: both platforms allow biometric or device passcode
against the same hardware-backed key... Biometric-only would lock out every
user who has not enrolled a face or finger."_ Epic task 1.22 already
specifies the same requirement independently. Treating this as an open
tradeoff in the first draft was an error, not a reconsideration of settled
guidance — this RFC now matches what was already decided elsewhere.

**Decision: `kSecAccessControlUserPresence` (iOS) /
`setUserAuthenticationRequired(true)` with device-credential fallback
enabled (Android) / whatever a given browser's platform authenticator
accepts as an equivalent (web, via PRF) — for every `device-only` plugin,
not manifest-declared per plugin.** A single, well-understood, accessible
setting is simpler to document and support than per-plugin variance, and
this is no longer really a tradeoff between two viable options: only the
`userPresence`-equivalent choice satisfies the accessibility requirement
that was never actually up for debate. Section 3's second wrapper remains
valuable regardless — it is what makes passkey deletion (web) and any
OS-level credential-invalidation edge case (native) survivable — but it is
no longer the thing that makes the _primary_ flag's strictness acceptable,
because the primary flag is no longer strict.

### 6. What web cannot fully match

Stated plainly rather than implied: WebAuthn PRF gets the **key-custody**
half to a genuinely equal bar as native — same class of hardware backing,
same live-proof-required-every-time property, same hardware-enforced
brute-force resistance. It does not get the **storage-durability** half to
an equal bar. `navigator.storage.persist()` is a request the browser may
deny, based on its own heuristics, and even granted it does not carry an
OS app sandbox's guarantee — a user's "clear site data" action, or a
browser's own data-clearing settings, can still remove it in ways an
installed native app's storage is not exposed to. If `persist()` is denied
at enrollment, the user is told plainly, in the same spirit as the Layer 1
escrow warning — not silently degraded to a weaker guarantee with no
notice. `device-only` on web is real and hardware-backed for the key; it is
best-effort, not guaranteed, for the data surviving to be unlocked at all.

### 7. Revocation position

Stated deliberately, per research 0012's open question 4: server-side
account deactivation/purge does **not** and cannot reach `device-only`
data — the server never holds a usable key, on either platform. For a
sovereignty product this is the correct position (it is the user's data on
the user's device), but it is a real departure from the existing sign-out
purge's assumption that it reaches everything, and must be documented in
`docs/architecture-rules.md` as a stated exception once implemented, not
discovered later by an operator expecting deactivation to be total.

## Alternatives considered

**Derive the key from device + user credentials, server-assisted.**
Rejected. If the server can (by verifying credentials) derive or
reconstruct the key, then anyone with access to the auth database can too —
this silently converts `device-only` into `offline-first` with a
misleading name. A version that preserves the "server never learns the
key" property is possible via an OPRF-style blinded protocol, but that
requires a rate-limited, tamper-resistant server-side component (ideally
enclave-backed) purpose-built to resist offline brute-forcing of a human
password — materially _more_ infrastructure than Keychain/Keystore or PRF
custody, not a simplification. Worth revisiting only if a future plugin
needs `device-only`-grade guarantees for users with no platform
authenticator at all.

**Reuse RFC 0060's existing Device Key as `device-only`'s primary key.**
Rejected — see "Current state" above. IndexedDB-backed, no presence gate.
Its recovery-secret and wrapped-key-storage _machinery_ is reused (section
3, section 4 Layer 3); the key itself is not.

**PIN-only software wrapping, on either platform.** Rejected — see
section 2. No hardware rate limiting; brute-forceable offline once the
storage is extracted. Worse on web than native, since web has no hardware
fallback to lean on at all if the PIN wrapper is the only protection.

**Plain WebAuthn without PRF as a client-side gate.** Rejected — see
section 2. Produces a yes/no signal, not key material; gating a local
decrypt on it is the same theater pattern as a JS-side flag.

**`kSecAccessControlBiometryCurrentSet` (this RFC's own first draft).**
Rejected on reflection — see section 5. Locks out users without enrolled
biometrics, contradicting an accessibility requirement already stated
elsewhere in research 0012 and epic task 1.22.

**Operator escrow by default.** Rejected, same reasoning RFC 0060 already
established: the threat model this tier defends against includes a
compromised operator, so an operator-held default recovery path
contradicts the tier's own purpose. Operator involvement only ever enters
via the explicit, opt-in, env-gated Layer 3 — and even there, the operator
controls _whether the capability exists_, never the key itself.

## Open questions

**Resolved since v0.3** (design session, August 2026) — PRF salt scheme,
re-lock policy, and the RFC 0060 integration shape are no longer open; see
section 2 (salt scheme, re-lock policy) and section 3 (recovery-secret
independence) above for the decisions and reasoning. Kept here only as a
changelog pointer, not restated.

**Resolved in v0.6** (design review + developer confirmation, August 2026) —
the Capacitor secure-storage implementation is a **thin custom bridge**,
not a third-party plugin. A desk review of the readily available, maintained
candidates found none that cleanly meet this section's requirement:

- **`@aparajita/capacitor-secure-storage`** stores values encrypted at rest
  (Keychain / Keystore-backed AES-GCM) but applies **no access control to
  the item itself** — biometric gating is a separate, non-binding check via
  its companion `@aparajita/capacitor-biometric-auth` plugin, called before
  `get()`/`set()` in JS. That is exactly the "JS-side PIN or 'unlocked' flag
  as the gate" pattern this section already rejects above: the storage item
  has no hardware-enforced lock of its own, so anything that can call the
  plugin's `get()` can read the value without passing through the biometric
  check at all.
- **`capacitor-secure-storage-plugin`** exposes no access-control parameters
  whatsoever — plain encrypted storage only.
- **`@drefrajo/capacitor-biometric-keychain`** does invoke device biometric
  authentication automatically on `getItem()`/`setItem()` (closer to the
  right shape), but its README documents no option to require a
  **device-credential fallback** rather than biometry alone, and — small
  project (single-digit-star range, two open issues at review time) —
  whether the underlying native binding is actually the hardware
  access-control primitive versus an app-level check ahead of a plain read
  isn't verifiable from its public docs.
- Where the correct native pattern _does_ appear in the wild (an
  `accessControl`/`SecAccessControlCreateFlags` value bound to the Keychain
  item on iOS, a `CryptoObject`-gated key on Android), the default nearly
  everyone reaches for is `.biometryCurrentSet`/`.biometryAny` —
  **biometry-only** — the exact configuration §5 below already corrected
  once in this RFC's own design ("never biometric-only, which locks out
  unenrolled users"). Any pre-built option would need explicit, verified
  confirmation that it supports the device-credential-inclusive variant
  (`.userPresence` on iOS, `setDeviceCredentialAllowed(true)` alongside
  `setUserAuthenticationRequired(true)` on Android), not just whichever
  flag its README happens to mention — none of the reviewed candidates
  offered that confirmation.

**The decision:** write the bridge directly against `LocalAuthentication`/
`BiometricPrompt` + Keychain/Keystore APIs, rather than adopt a third-party
plugin. The native surface needed is small and fully specified by this
section (one access-controlled item per device, `get`/`set`/`remove`/
`keys`/`clear`, `kSecAccessControlUserPresence` /
`setUserAuthenticationRequired(true)` with device-credential enabled) —
writing it directly avoids taking a dependency on a third-party plugin
whose correctness on precisely this security property can't be verified
from outside, for a surface too small to be worth that risk.
`sovereign-mobile`'s implementer should still re-check this bar against
whatever the plugin ecosystem looks like at build time (a library closing
this exact gap may exist by then) rather than treat "write it from
scratch" as unconditional — but the bar stays "verified to bind the
device-credential-inclusive access-control flag to the item itself," not
"has a biometric prompt somewhere in its API."

**Resolved in v0.7** (`sovereign-mobile` implementation, August 2026) — the
storage-backend pick from section 1, `@capacitor-community/sqlite`, is
unusable as this shell is built and was replaced with a direct SQLCipher
library dependency, not evaluated against alternatives (there was no
alternative-plugin question here — the finding ruled out the entire "native
storage via a Capacitor plugin" approach, not just one plugin's choice of
access-control flag as v0.6 did for key custody).

The problem: `@capacitor-community/sqlite`'s entire API is JS-facing
(`window.Capacitor` + registered-plugin calls from page JS), but this shell
strips Capacitor's own bridge from the WebView whenever it shows remote
content — `sovereign-mobile`'s `MainViewController.swift` documents this as
"Bridge isolation," a hard security property of the shell (RFC 0080's
device-surface model depends on the remote page never reaching raw
Capacitor), not a bug to route around. The plugin has no native-to-native
API to call instead; its Swift/Kotlin implementation is written to be driven
by its own JS bridge glue, which is exactly what gets removed. This was
confirmed by inspecting the plugin's own source (its podspec/`build.gradle`
dependency declarations), not assumed.

**The fix:** link the same underlying native SQLCipher libraries that
plugin itself depends on, directly — `SQLCipher.swift` (the official
Zetetic-maintained Swift Package) on iOS, `net.zetetic:sqlcipher-android` +
`androidx.sqlite:sqlite` on Android — bypassing the plugin wrapper entirely.
Both link and build-verify cleanly (real `xcodebuild`/`:app:assembleDebug`
runs, not just dependency resolution) against `sovereign-mobile`'s existing
project structure. Full detail, including the resulting iOS/Android
key-custody divergence this forced (Android Keystore's non-extractability,
noted in section 2 above), lives in that repo's own
`docs/epics/bridge.md` task 20.13 entry — not restated here since it's
implementation detail this RFC's "Native (Capacitor)" line only needs to
name correctly, not fully re-derive.

This is a correction to this RFC's own section 1, not a new decision this
RFC needed to make: the _shape_ section 1 specifies (a SQLCipher-encrypted
SQLite database, app-sandboxed, one per instance) is unchanged and fully
delivered — only the mechanism reaching it (direct library linkage instead
of a Capacitor plugin) differs from what was originally named.

**Resolved in v0.7 (continued)** — with the native `secureStorage` bridge
capability build- and interactively-verified on both platforms (task 20.13),
two plugin-facing gaps stood between that and an actually-usable
`device-only` tier on native shells, both found and closed by live-testing
against a real installed native app rather than trusting the earlier
build-verification alone:

1. `plugins/account/app/_components/DeviceStorageKeySection.tsx` (the
   Account → Security setup UI) unconditionally called the web-only
   `getDeviceStorageKeyStatus()`, which always answers `'unsupported'` on
   native (it checks WebAuthn/OPFS availability, not the bridge) — making
   the entire section permanently unreachable there. Fixed with a
   transport-specific dispatcher: `supports('secureStorage')` picks between
   a native branch (no enrollment step — native has none, the OS gates every
   `secureStorage` call directly — just a "Verify it works" round-trip
   button surfacing the device's real state, including the `'no-device-auth'`
   hard block from section 5) and the original web/PWA setup flow, unchanged.
2. `device-only-kv.ts` itself — the actual plugin-data storage primitive the
   fix above only gates access to — was still entirely OPFS-only, so even
   after fix 1, no `device-only` plugin could persist anything on a native
   shell; the read/write would silently no-op against a key derivation path
   (`getUnlockedDeviceStorageKey()`) that only ever returns `'unsupported'`
   there. Closed as described in section 1's "Interim key/value primitive"
   paragraph above: each of `get`/`set`/`delete`/`list`/`clear` now checks
   `supports('secureStorage')` and routes through the bridge on native,
   falling through to the original OPFS path otherwise.

The reference plugin (`example-plugins/example-device-only`,
`DeviceOnlyNotesView.tsx`) had the same class of bug as fix 1 — it gated its
own content behind `getDeviceStorageKeyStatus()` unconditionally, so it
would have stayed permanently blocked on native even with both fixes above
in place. Given the same transport-specific treatment: on native it skips
straight to its `NotesPanel` (no enrollment gate to pass), and hides the
web-only unlock-session badge/"Lock now" control and the
`ExportImportPanel` (RFC 0093 §4 Layer 2's export/import is web-only for the
same `listDeviceOnlyPluginIds()` reason noted above) rather than presenting
controls that would silently do nothing. Verified live on the iOS
Simulator against a real installed native app, not just typechecked: created
a note, confirmed it round-tripped through the bridge, force-killed and
relaunched the app, and confirmed the note survived — proving the write
path goes through the actual SQLCipher database rather than an in-memory
cache that a fresh JS context would lose.

Still open:

1. **Minimum browser/OS support floor for web `device-only`.** PRF needs
   iOS 18/Safari 18+ and recent Chrome/Android; below that,
   `isDeviceOnlyTierAvailable()` correctly reports `false` and the
   capability-restricted UI applies, but the exact floor needs to be
   pinned and documented for plugin authors and Console's install-review
   surface.
2. **Tauri/desktop parity.** Owned by `sovereign-desktop`'s own task 17.4 /
   workstream 0003 leg 3b, not this RFC — noted here only so a reader
   doesn't assume desktop is silently included.

## Adoption path

Unblocks workstream 0008 leg 4 (`docs/workstreams/0008-offline-first-architecture.md`),
sequenced 8.21 → 20.13 → 8.20 → 1.22 per that workstream's existing plan.
This RFC _is_ the 8.21 decision, plus the key-custody design both 20.13
(native transport) and 1.22 (device-auth unlock, native and web) need; once
accepted, leg 4 is no longer blocked on a product decision, only on
implementation. The Capacitor transport (section 2, native half) is built
in `sovereign-mobile` against the `@sovereignfs/bridge` contract this repo
publishes, per the existing repo-split table in the workstream doc. The web
half (PRF enrollment, OPFS backend) is this repo's own work under task 1.22
and does not depend on any other repository.

Manifest impact: none by itself (the `offline: 'device-only'` enum value
already shipped in leg 3). New `device:secureStorage` permission is part of
task 20.13's own scope, not this RFC's.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.8     | August 2026 | Closed the gap between task 20.13's build-verified native `secureStorage` bridge and an actually-usable native `device-only` tier, found by live-testing against a real installed native app rather than trusting the build-verification alone: `DeviceStorageKeySection.tsx` and `device-only-kv.ts` both unconditionally used web-only status/key-derivation functions that always answer "unsupported" on native, permanently blocking the tier's UI and its data storage respectively. Both now dispatch on `supports('secureStorage')`; `device-only-kv.ts`'s native path routes straight through the bridge with no app-level re-encryption layer (the SQLCipher database is already the encryption boundary), matching every function except `listDeviceOnlyPluginIds()` (no bridge equivalent exists, and its only caller is already web-only). The reference plugin (`example-plugins/example-device-only`) had the same gating bug and was fixed the same way. Verified live on the iOS Simulator: a note written through the reference plugin survived a force-kill and relaunch of the app. Section 1 and "Resolved in v0.7" under Open questions updated. |
| 0.7     | August 2026 | Section 1's storage-backend pick corrected: `@capacitor-community/sqlite` is unusable in `sovereign-mobile` as built — its JS-facing API is unreachable from the remote page under this shell's bridge-isolation model. Replaced with a direct SQLCipher library dependency (`SQLCipher.swift` on iOS, `net.zetetic:sqlcipher-android` on Android), confirmed by inspecting the plugin's own source and build- and link-verified on both platforms. Section 2 updated to note Android Keystore's non-extractability forces envelope encryption there, unlike iOS's direct Keychain-held raw key. See "Resolved in v0.7" under Open questions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.6     | August 2026 | Open question 1 (Capacitor secure-storage plugin choice) resolved: a thin custom bridge, not a third-party plugin. None of the readily available candidates bind a device-credential-inclusive access-control flag to the storage item itself — `@aparajita/capacitor-secure-storage` gates biometry via a separate, non-binding companion check (the JS-side-gate pattern this RFC already rejects), `capacitor-secure-storage-plugin` has no access-control option at all, and `@drefrajo/capacitor-biometric-keychain`'s binding mechanism isn't verifiable from its public docs. Confirmed by the developer; `sovereign-mobile` should still re-check the plugin landscape at build time against the stated bar, not treat this as unconditional, but the default is now build-it, not evaluate-first.                                                                                                                                                                                                                                                                                                                                                             |
| 0.5     | August 2026 | Enrollment centralized: one "Device Storage Key" (renamed from "Device Key" to avoid colliding with RFC 0060's existing, unrelated internal "device key" concept), set up once in Account → Security (parallel to RFC 0060's Client-side encryption section, cryptographically independent from it), shared by every `device-only` plugin — not triggered per-plugin. A plugin missing it directs the user to Account → Security instead of running its own enrollment ceremony. Decouples Device Storage Key lifecycle from any plugin's access grant (RFC 0065) entirely. Section 2, section 3 wording updated to match.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.4     | August 2026 | Resolved the three remaining open questions: PRF salt/versioning scheme (fixed purpose-scoped salt + version tag, section 2), re-lock policy (timed default with a user override, chosen specifically to close the iOS/Android backgrounding-behavior asymmetry task 20.10 found, section 2), and the RFC 0060 integration shape (device-only's recovery secret is independent of RFC 0060's CMK recovery secret, section 3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.3     | August 2026 | Accepted. Unblocks workstream 0008 leg 4 — see the workstream doc's own changelog for the leg-4 status update this triggered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.2     | August 2026 | Brought web/PWA into scope (was deferred in 0.1): WebAuthn PRF key custody, OPFS/`wa-sqlite` storage, `navigator.storage.persist()` handling. Corrected an error in 0.1 — replaced `kSecAccessControlBiometryCurrentSet` with a `userPresence`-equivalent flag everywhere, matching an accessibility requirement research 0012 and epic task 1.22 had already established; resolves research 0012's open question 3 as well as open question 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.1     | August 2026 | Initial draft, from a design session resolving research 0012's escrow open question and elaborating its device-only key-custody recommendation. Native (Capacitor) only; web explicitly deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
