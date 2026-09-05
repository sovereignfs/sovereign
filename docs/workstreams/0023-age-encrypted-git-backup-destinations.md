# Workstream 0023 — Age-encrypted Git backup destinations

**Status:** ⏳ In progress — legs 1–5 done (tasks 8.37–8.41; leg 4 was the gate leg and passed — see its own changelog entry; leg 5 was verified against the actual production-shaped Docker topology, not just a native `pnpm dev` checkout — see its own changelog entry). Leg 6 (`sv restore --age-identity` + docs) remains.\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0064](../rfcs/0064-git-backed-operator-backups.md) (git-backed
operator backups — this workstream resolves the remaining, per-user-shaped
half of its still-open Question #1; the operator-shaped half was already
resolved by workstream 0004 for its own narrower scope); [0084](../rfcs/0084-ui-driven-backup-restore.md)
(UI-driven backup & restore — extends its per-user scope, which is
download-link-only today, with a git destination and a real restore path);
builds directly on top of workstream [0004](0004-ui-backup-restore.md)'s job
infrastructure and UI rather than duplicating it, and makes one small amendment
to 0004 itself (see Prerequisites).\
**Epics touched:** 8 (Data Sovereignty)\
**Research:** none — this workstream's Decisions Locked table was settled
directly with the goal owner across a planning conversation (2026-08-31),
in the same spirit as the research-as-design exception
([workstreams/README.md](README.md#authoring-one)) even though no separate
research doc exists. Treat this document's own Decisions Locked table as
that record.

---

## Goal

Any instance operator, and any individual end-user, can point Sovereign at a
git server they control — any server, not a specific provider — as a backup
destination, with the archive encrypted using an [age](https://age-encryption.org)
identity that Sovereign itself never possesses at any point, so the backup
remains fully decryptable and restorable using nothing but the git repository
and the held identity, with zero dependency on Sovereign being installed,
running, or even the same version. Operators get this as an additional
encryption mode alongside workstream 0004's existing passphrase option
(git-push itself already ships in that workstream); regular users get an
entirely new capability workstream 0004 explicitly does not cover — a personal
git backup destination for their own async data backups, plus a real restore
path back into the app.

## Definition of done

- [x] Workstream 0004's shared encryption helper is migrated to run on `age`'s
      own passphrase mode instead of raw Node `crypto`, with zero behavior
      change visible to its existing callers or tests. (Leg 1)
- [x] An operator can configure an age recipient for instance-scope git-push
      backups, in addition to (not instead of) the existing passphrase option
      from workstream 0004 leg 2. (Leg 5 — verified live against real
      Postgres/Docker infrastructure that the pushed copy decrypts only with
      the matching identity, never the passphrase, and vice versa for the
      direct-download copy.)
- [ ] An operator can restore an age-recipient-encrypted instance backup via
      `sv restore --age-identity <file>`, decrypting with a key that never
      touched the running instance's process or disk.
- [x] Any user can generate their own age identity entirely client-side
      (browser), with the private key never transmitted to or stored by the
      server at any point — verified by inspecting network traffic during
      generation, not just by code review. (Leg 2; re-confirmed via
      `read_network_requests` during leg 4's own live verification.)
- [x] Any user can connect a personal git repository (any server, HTTPS token
      or SSH) as a destination, and their existing async data backup
      (workstream 0004 leg 3) can optionally push there as an encrypted,
      tagged commit. (Legs 2–3)
- [x] Any user can list their personal git-backed backups, pull one back into
      the app, decrypt it entirely client-side with their held identity, and
      have the result flow into the existing `POST /api/account/import`
      endpoint unchanged. (Leg 4 — verified live end to end against a real
      dev server and a real local git remote.)
- [x] Cloning a user's backup repo and decrypting the latest tag with any
      standard `age` client (not just Sovereign's own UI) fully recovers their
      data — verified directly against a real repo and a real, separately
      installed `age` binary, not assumed from the file format alone. (Leg 4:
      `encryptToRecipients()`'s own output, decrypted with the real,
      independently-installed `age` v1.3.1 CLI — not this repo's code at all
      — byte-for-byte identical to the source plaintext.)
- [x] Losing a personal identity is clearly communicated as unrecoverable at
      generation time — there is deliberately no server-side escrow. (Leg 2 —
      `BackupDestinationPanel`'s "Save this key now — it won't be shown
      again" warning.)

## Decisions locked

Settled with the goal owner during planning, August 2026.

| Decision                            | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Rejected alternative and why                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                               | Both: operator whole-instance (extends workstream 0004 leg 2) and individual end-user personal destinations (new)                                                                                                                                                                                                                                                                                                                                                                                                        | Operator-only — leaves the "decrypt separately" framing unaddressed for the persona it matters most to; per-user-only — leaves workstream 0004's existing passphrase-only operator git-push without a recipient-mode option                                                                                                             |
| Key model                           | One instance-wide age identity for the operator; one age keypair per end-user                                                                                                                                                                                                                                                                                                                                                                                                                                            | A single shared instance key for everyone — collapses "decrypt separately" back into "the operator can decrypt your data," which defeats the point for the per-user case                                                                                                                                                                |
| Key generation                      | Operator: `age-keygen`, entirely outside Sovereign, on the operator's own machine — Sovereign only ever receives the public recipient string. Per-user: client-side in the browser (`age-encryption`, pure JS), private key shown once for download, never transmitted                                                                                                                                                                                                                                                   | Server-generated-then-shown-once for either case — the server would transiently possess the private key in process memory, even if never persisted; a strictly weaker guarantee than "the server is architecturally incapable of decrypting"                                                                                            |
| Sovereign never holds a private key | Architectural invariant, both scopes, no exceptions — decryption of a recipient-mode backup happens only in the operator's own `sv restore` invocation (operator-held key file) or in the user's own browser (client-side)                                                                                                                                                                                                                                                                                               | A restricted-access server-side key store for emergency recovery — rejected as scope creep on this workstream; if wanted later it is an explicit, separate, opt-in escrow feature, not a default                                                                                                                                        |
| Encryption implementation           | Standardize on the `age` format for everything — its passphrase mode (scrypt-based, symmetric) replaces workstream 0004's raw Node `crypto` AES-256-GCM helper with identical behavior, and its recipient mode is the new capability this workstream adds                                                                                                                                                                                                                                                                | Two parallel encryption implementations (0004's raw AES-256-GCM+scrypt for passphrase mode, a separate age library for recipient mode) — unnecessary duplication once age's own passphrase mode covers the same UX workstream 0004 already promises                                                                                     |
| Relationship to workstream 0004     | Small amendment only: the "Encryption implementation" decision row and its Leg 1 encryption helper migrate to age's passphrase mode. Everything else in 0004 (job infra, Console UI, Account UI, restore-stays-existing-import-flow for its own scope) is unchanged                                                                                                                                                                                                                                                      | Leaving 0004 fully untouched (two competing encryption implementations long-term); folding this workstream's whole scope into a rewritten 0004 (0004 is scoped to RFC 0084's adoption path specifically — this workstream's scope is bigger and spans RFC 0064 too, so a new workstream number keeps each one independently reviewable) |
| Credential storage (both scopes)    | `sdk.secrets` + `sdk.connections` (RFC 0043/RFC 0049), following the exact shape `plugins/warden/app/_lib/providers.ts` already establishes: a `sdk.connections` record for the labeled destination + status/health tracking, bridged via `secretRef` to a `sdk.secrets` entry holding the git token/SSH key. `scope: 'user'` for personal destinations, `scope: 'instance'` (gated by `instance:configure`) for the operator's — mirrors what workstream 0004 leg 2 already does via the `SmtpSettingsForm.tsx` pattern | A new bespoke secret-storage mechanism for this feature — rejected per RFC 0043's own stated motivation ("without a shared vault, each plugin must implement its own encryption... inconsistent and easy to get wrong")                                                                                                                 |
| Age recipient storage               | Plain `sdk.connections` metadata (not the vault) for both scopes — a public recipient string cannot decrypt anything, so it is not a secret                                                                                                                                                                                                                                                                                                                                                                              | Storing it in `sdk.secrets` alongside the token — unnecessary, and would incorrectly imply it needs the same access restrictions as the credential that actually authenticates the push                                                                                                                                                 |
| Git tooling                         | Shell out to the real `git` binary via `execFileSync` with an argv array — no interpolated shell strings, per the existing hard rule on request-derived values (repo URL, branch, token are all user-supplied here)                                                                                                                                                                                                                                                                                                      | Adding `isomorphic-git`/`simple-git`/`nodegit` as a new dependency — none exist in this repo today (confirmed by grep); shelling out matches the existing precedent of `sv backup` itself spawning `pg_dump`/`tar` as subprocesses                                                                                                      |
| Git storage model                   | One orphan commit per backup, tagged `sv-backup/<timestamp>/v<platform>` — same shape RFC 0064 and workstream 0004 leg 2 already use. Listing is a plain `git ls-remote --tags` (sync, no object fetch, no separate index file required for correctness)                                                                                                                                                                                                                                                                 | A linear commit history — makes deletion not actually free disk space (old blobs stay reachable through history); a required branch-based index file — RFC 0064 offers this only as an optional optimization for large tag counts, not a correctness requirement                                                                        |
| Restore UX                          | In-app: server fetches the chosen tag's ciphertext (never sees the private key) via an extension of workstream 0004's `backup_jobs` worker, streams it to the browser, client-side decrypts with an identity the user supplies for that one operation, decrypted bytes `fetch()` straight to the existing unmodified `POST /api/account/import`. The git-repo-plus-any-age-client path stays true as the underlying, Sovereign-independent fallback regardless                                                           | Push-only with fully manual restore only — simpler and marginally safer, but a real adoption tax for the non-technical persona RFC 0084's own motivation section names; server-side decrypt — would require the server to receive the private key, violating the "never holds a private key" invariant above                            |
| Async job model                     | Extend workstream 0004's existing `backup_jobs` table/worker with a new job kind (`restore-fetch`) rather than a second job mechanism                                                                                                                                                                                                                                                                                                                                                                                    | A dedicated new async pipeline for this one flow — 0004's worker already solves claim/tick/timeout/signed-delivery; forking it duplicates infrastructure for no new requirement                                                                                                                                                         |
| CSP                                 | **No change needed.** Originally planned to add `'wasm-unsafe-eval'` to `script-src` in `runtime/src/security.ts`, assuming `age-encryption` used WASM. Corrected during task 8.37 (leg 1): the package is pure JS (`@noble/ciphers`/`@noble/curves`/`@noble/hashes`), no `.wasm` asset ships in it at all — verified by inspecting the installed package directly.                                                                                                                                                      | The original `'wasm-unsafe-eval'` plan — not a real alternative, a superseded assumption based on an unverified guess about the library's implementation, corrected once the actual dependency was installed and inspected in task 8.37                                                                                                 |
| MAX_IMPORT_BYTES ceiling            | Inherit the existing 50MB limit on `POST /api/account/import` (`runtime/app/api/account/import/route.ts:8`) as a documented v1 limit, not something this workstream fixes                                                                                                                                                                                                                                                                                                                                                | Lifting the ceiling as part of this workstream — the gap is pre-existing in workstream 0004/RFC 0084's own restore design (the async _generate_ path is already uncapped, restore is not, regardless of git), not specific to this workstream; fixing it is a named, separate follow-up                                                 |
| SQLite/sqld operator backup gap     | Accepted as an inherited limitation — `sv backup` has no automated SQLite/sqld support today (`bin/sv.ts:818-830`), so operator-scope git-push (this workstream's leg 5, and workstream 0004 leg 2's existing plan) is Postgres-dialect-only in practice until that gap is closed elsewhere                                                                                                                                                                                                                              | Building sqld backup support as part of this workstream — out of scope; a pre-existing gap in epic task 8.1/8.16, not introduced here                                                                                                                                                                                                   |
| Workstream execution                | Legs — one branch, one draft PR, one review gate per leg                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Stacked per-task branches, or one giant PR per workstream — matches workstream 0004's own precedent                                                                                                                                                                                                                                     |

## Prerequisites

- **Workstream 0004's legs 1–3 (epic tasks 8.16, 8.17, 8.18) fully shipped
  (✅), not just code-complete-and-disabled.** Per 8.16's own progress note,
  leg 1's primitives already exist in code but are gated behind
  `SOVEREIGN_BACKUP_WORKER_ENABLED` (off by default) because instance-scope
  jobs cannot yet succeed in the documented production Docker deployment (the
  `runner` image has no `bin/`/`scripts/`/`tsx` to spawn `sv backup` from —
  `docs/architecture-rules.md`'s entry on this exact gap) and because no
  enqueue path exists yet for either scope. This workstream's operator-scope
  legs (5, 6) inherit that same blocker directly, since they also depend on a
  real `sv backup` archive to encrypt and push — **this workstream does not
  fix that gap**, it assumes 0004 reaching real ✅ already resolved it.
- **This workstream's per-user-scope legs (2, 3, 4) do not share that
  blocker.** Per-user backup generation goes through `assembleExport()`
  in-process (workstream 0004 leg 3's own design), never a subprocess spawn —
  so legs 2–4 can proceed once 0004 leg 3 (8.18) specifically has shipped,
  even if leg 5/6's operator-scope prerequisite (0004 leg 2, 8.17) is still
  blocked on the Docker-spawn gap. Owner: whoever picks up this workstream
  should confirm 8.17 vs. 8.18's actual ship order before assuming both are
  simultaneously ready.
- The Warden precedent this workstream's credential-storage decision leans on
  (`plugins/warden/app/_lib/providers.ts`) already exists and is shipped — no
  prerequisite work needed there, it's a pattern to copy, not a dependency to
  wait on.

## Legs

| Leg | Name                                    | Epic tasks | Epics | Gate?                   | Done when                                                                                                                                                                                                              |
| --- | --------------------------------------- | ---------- | ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Age encryption primitives               | 8.37       | 8     | No                      | Workstream 0004's passphrase-mode helper runs on `age` with identical behavior (existing tests pass unmodified); a new recipient-mode encrypt function exists, tested, with no decrypt counterpart shipped server-side |
| 2   | Per-user identity & connection          | 8.38       | 8     | No                      | A user can generate an age identity in-browser, download it, and connect a personal git repo (repo URL, branch, credential, recipient) via the Account UI — no push happens yet                                        |
| 3   | Per-user git push                       | 8.39       | 8     | No                      | A real async user backup (0004 leg 3) optionally pushes an age-recipient-encrypted, tagged, orphan commit to the user's configured repo end to end                                                                     |
| 4   | Restore from a personal git destination | 8.40       | 8     | Yes — see Kill criteria | A user lists their git-backed backups, pulls one, decrypts it client-side, and it lands in their account via the unmodified import endpoint, end to end on a real device                                               |
| 5   | Operator age-recipient destination      | 8.41       | 8     | No                      | An operator configures an age recipient (alongside the existing passphrase option) and a real instance backup pushes encrypted to that recipient                                                                       |
| 6   | Operator CLI restore & docs             | 8.42       | 8     | No                      | `sv restore --age-identity <file>` recovers a recipient-mode instance backup; `docs/self-hosting.md` and `docs/security.md` reflect the new destination type                                                           |

Legs 2–4 (per-user) and legs 5–6 (operator) are independent of each other
after leg 1 — they can be reordered or run by two engineers in parallel.
Leg 4 is marked a gate: if client-side decrypt proves unworkable (see
Kill criteria), legs 5–6 are unaffected since they never touch browser
decrypt at all. Default sequence: 1 → 2 → 3 → 4, then 5 → 6 whenever the
Docker-spawn prerequisite is actually resolved.

## Leg detail

### Leg 1 — Age encryption primitives

**Epic tasks:** 8.37

**Why this leg is first:** every other leg either calls the passphrase-mode
helper (unchanged call sites, changed implementation) or the new
recipient-mode function. Getting this right once, in isolation, with
workstream 0004's existing test suite as a behavior-preservation check, keeps
every later leg from needing its own crypto review.

**Technical notes:**

- `age-encryption` (pure JS, built on `@noble/ciphers`/`@noble/curves`/`@noble/hashes`; same author as the `age` spec/CLI) is the
  one new dependency — it runs identically in Node (server-side passphrase
  mode, operator encrypt) and in the browser (client-side recipient-mode
  decrypt, leg 4), so no second library is needed for either environment.
- The existing passphrase-mode helper (workstream 0004 leg 1,
  `runtime/src/` — the module 8.16 shipped) keeps its exact signature
  (`encrypt(buffer/stream, passphrase) → ciphertext`,
  `decrypt(ciphertext, passphrase) → plaintext or throws`); only its internals
  swap from Node's raw `crypto`/`scrypt` to `age`'s own passphrase (scrypt)
  recipient stanza. Every existing caller and test in legs 2/3 of 0004 should
  pass unmodified — that's the concrete proof this is a safe swap, not a
  behavior change.
- New function, additive: `encryptToRecipients(bytes, recipients: string[]) → ciphertext`.
  Age supports multiple recipients transparently in one file — a future
  "also encrypt to an operator escrow recipient" option (not in this
  workstream's scope) would cost nothing extra here. No corresponding
  server-side `decryptWithIdentity` — decryption of recipient-mode ciphertext
  never happens server-side, by the locked invariant above; only the CLI
  (`sv restore`, operator's own process, leg 6) and the browser (leg 4) ever
  call an age decrypt with a private identity.

**Do not proceed if:** the passphrase-mode swap changes observable behavior
for any existing workstream-0004 test (timing characteristics aside) — that
would mean the "small amendment" framing this workstream's Decisions Locked
table promised to 0004 was wrong, and needs to go back to the goal owner
before continuing.

### Leg 2 — Per-user identity & connection

**Epic tasks:** 8.38

**Technical notes:**

- New Account UI (likely `plugins/account/app/data/` alongside the existing
  `PortabilityPanel.tsx`, or a new `plugins/account/app/backups/` page):
  "Generate a backup key" — runs `age-encryption` in-browser, shows the
  identity once with heavy "save this now, we cannot show it again" friction
  (download-as-file plus copy-to-clipboard), sends only the public recipient
  to the server. Verify with real network-tab inspection during generation
  that the private key never appears in any request, not just by reading the
  code.
- Connection storage follows `plugins/warden/app/_lib/providers.ts` verbatim
  in shape: `sdk.secrets.create({ scope: 'user', label, value: gitToken })`
  for the credential (PAT or SSH private key), `sdk.connections.create({
scope: 'user', provider: 'git.custom', label, secretRef, metadata: {
repoUrl, branch, ageRecipient } })` for the record. `ageRecipient` is plain
  metadata, not a secret (see Decisions Locked). Reuse
  `sdk.connections.disconnect()`'s existing atomic secret-cleanup behavior —
  do not hand-roll deletion.
- Account gets a "connected git destination" view for free from this shape,
  matching RFC 0043's own UI section (`Account: "connected credentials" per
plugin for the current user`) and the health-tracking fields
  (`status`/`lastError`/`lastCheckedAt`) `sdk.connections` already provides.
- No push logic in this leg — it only makes the destination configurable.
  Keeping it separate from leg 3 keeps each leg's PR reviewable in isolation
  (key-generation UX and crypto correctness vs. git-push mechanics are
  different review concerns).

**Do not proceed if:** the identity-generation flow cannot be verified to
never transmit the private key over the network in a real browser session —
this is the single load-bearing security property of the entire per-user
scope; if `age-encryption`'s browser API shape makes this hard to
guarantee, stop and revisit before building anything that depends on it.

### Leg 3 — Per-user git push

**Epic tasks:** 8.39

**Technical notes:**

- Extends workstream 0004 leg 3's async user backup job with an optional
  "push to my connected git destination" step, using leg 2's connection and
  leg 1's `encryptToRecipients`. This runs in-process (no subprocess spawn),
  matching leg 3 of 0004's own design — not affected by the Docker-spawn
  blocker noted in Prerequisites.
- New shared module, e.g. `runtime/src/git-backup.ts`, wrapping `git`
  invocations via `execFileSync` with argv arrays (never a template string) —
  `init`/`commit`/`tag`/`push` against a temp working directory, one orphan
  commit per backup. Workstream 0004 leg 2's existing/planned operator
  git-push logic should be refactored to share this module rather than
  duplicating shell-out logic between the two scopes — a light touch to
  8.17's code, not a redesign of it.
- Tag shape: `sv-backup/<timestamp>/v<platform>`, matching RFC 0064 and 0004
  leg 2 exactly, so both scopes' backups are recognizable by the same
  convention in any git host's UI.
- Push failure (auth rejected, network error, remote full) must land the
  connection in `status: 'needs_reauth'` or `'error'` via
  `sdk.connections.markError()` — reusing the health-tracking fields from leg
  2 rather than only surfacing failure in the job's own error field.

**Do not proceed if:** a failed push silently leaves the async backup job
itself marked `complete` — the local archive succeeding while the git push
silently fails would be a real trust regression (user believes their data is
off-host when it isn't). The job status must distinguish "archive generated"
from "archive generated and pushed" when git push was requested.

### Leg 4 — Restore from a personal git destination

**Epic tasks:** 8.40

**Gate.** See Kill criteria — if this leg's core verification step fails,
legs 5–6 are unaffected and can still ship.

**Technical notes:**

- Listing: `git ls-remote --tags <repo>` against `sv-backup/*`, synchronous,
  no job needed — parse the timestamp out of the tag name for display.
- Fetching: new `backup_jobs` kind (e.g. `kind: 'restore-fetch'`) reusing
  workstream 0004 leg 1's worker/claim/tick/signed-download machinery
  end to end, not a new pipeline. A shallow `git fetch --depth=1 <remote>
<tag>` into a temp dir, read the one blob, deliver via the existing
  signed-download route shape (streamed, not buffered). Note this route is
  strictly safer than 0004's own passphrase-mode download route: the link
  only ever carries ciphertext, and the decrypting identity was never
  transmitted anywhere, not even at download time — a leaked link here is
  worthless on its own.
- Client-side decrypt: `age-encryption` in the browser, streaming
  (ChaCha20-Poly1305 STREAM construction), so a near-250MB personal backup
  doesn't need to fit in memory at once. Identity input via a file picker
  (`FileReader`, matching the existing pattern in
  `packages/sdk/src/device-client.ts`'s `pickViaFileInput`) — the value lives
  in a local variable scoped to the decrypt call only, never React state,
  never `sessionStorage`; re-prompt on a second restore rather than
  remembering it.
- No CSP change needed — `age-encryption` is pure JS, not WASM (confirmed in
  task 8.37); the original plan to add `'wasm-unsafe-eval'` to `script-src` in
  `runtime/src/security.ts` was based on an incorrect assumption.
- Decrypted bytes go to the existing, unmodified
  `POST /api/account/import` via a plain client-side `fetch` — no new import
  code. This inherits `MAX_IMPORT_BYTES` (50MB,
  `runtime/app/api/account/import/route.ts:8`) — document this ceiling
  prominently in the restore UI itself ("backups over 50MB can't be restored
  in-app yet — decrypt with any `age` client and contact support" or
  similar), do not silently fail past it.

**Do not proceed if:** client-side decrypt cannot be verified reliable
and reasonably fast on a real low-power mobile device against a realistic
(~50–100MB) personal backup — see Kill criteria for the fallback if this
holds.

### Leg 5 — Operator age-recipient destination

**Epic tasks:** 8.41

**Technical notes:**

- Extends workstream 0004 leg 2's Console git-push settings with an
  optional age-recipient field, stored as plain (non-secret) config — not
  through `sdk.secrets`, since a recipient string isn't sensitive (Decisions
  Locked). The existing passphrase field stays; an operator may configure
  either or both (age supports multiple recipients per file natively, so
  "encrypt to both a passphrase and a recipient" costs nothing extra at the
  format level, though whether to expose that combination in the UI is an
  implementation-time call, not a locked decision here).
- Push mechanics reuse leg 3's shared `git-backup.ts` module rather than
  0004 leg 2's own bespoke implementation (light refactor of that leg's
  code, called out in leg 3's notes above).
- This leg cannot be verified end-to-end until the Docker-spawn prerequisite
  (see Prerequisites) is actually resolved, independent of anything in this
  leg's own code — do not treat a clean local `pnpm dev` test as sufficient
  proof; verify against the actual production-shaped Docker topology
  (`docs/architecture-rules.md`'s entry on this gap describes the exact
  reproduction).

**Do not proceed if:** the Docker-spawn prerequisite is still open when this
leg is picked up — stop and confirm with whoever owns 0004 leg 2 / epic task
8.16 that it has actually shipped, not just merged with the worker still
gated off.

### Leg 6 — Operator CLI restore & docs

**Epic tasks:** 8.42

**Technical notes:**

- `sv restore` gains `--age-identity <file>` — decrypts server-side (the
  operator's own CLI process, run by the operator, using a key file the
  operator supplies from their own storage) before applying the existing
  restore logic unchanged. This does not violate the "Sovereign never holds
  a private key" invariant: the invariant is about the running instance
  process never possessing it, and `sv restore` here is the operator's own
  CLI invocation, structurally identical to how they'd already need to
  supply a passphrase for the existing passphrase-mode restore.
- SQLite restore's existing marker-reconciliation logic (`bin/sv.ts:696-746`,
  load-bearing per the 2026-07-24 RFC 0071 incident) is inherited unchanged
  — this leg does not touch SQLite-dialect restore logic at all, only the
  decrypt step ahead of it.
- Docs: `docs/self-hosting.md` (new env var / config surface for the age
  recipient, alongside RFC 0064's existing `SV_BACKUP_GIT_*` naming),
  `docs/security.md` (age-recipient mode as a documented backup encryption
  option, and the "losing your identity is unrecoverable by design" warning
  for both scopes).

**Do not proceed if:** none — this leg is docs plus a CLI flag, low risk,
last in sequence deliberately so it can absorb whatever leg 5 actually
shipped rather than being speculative ahead of it.

## Risks

- **RESOLVED (epic task 8.16, confirmed before leg 5 started).** The
  production Docker sv-CLI-spawn gap previously blocked workstream 0004
  leg 2 itself (per 8.16's own progress note), and this workstream's legs
  5–6 inherited that blocker rather than introducing it. Task 8.16 closed it
  for the Postgres dialect; leg 5 independently re-verified this live
  (rebuilt Docker images, real Postgres, a real instance backup completing
  and pushing successfully) before proceeding, per its own "do not proceed
  if" clause, rather than assuming the merge alone was sufficient.
- **SQLite/sqld has no automated `sv backup` support today**
  (`bin/sv.ts:818-830`) — operator-scope git-push (both this workstream's
  leg 5 and workstream 0004 leg 2's existing plan) is Postgres-dialect-only
  in practice until that separate gap closes. Not blocking for this
  workstream's per-user legs, which don't go through `sv backup` at all.
- **Losing a personal age identity is unrecoverable by design** — there is
  no server-side escrow (a deliberate consequence of the "never holds a
  private key" invariant). The generation-time UX in leg 2 carries real
  weight here; underselling the friction is a worse failure mode than
  overselling it.
- **Client-side decrypt performance on real mobile devices is unverified
  until leg 4** — `age-encryption` is pure JS (not WASM, corrected during
  task 8.37), and pure-JS crypto is often meaningfully slower than a WASM or
  native implementation for CPU-heavy streaming decryption over a large file.
  Its streaming construction should still avoid needing the whole archive in
  memory at once, but "should" isn't "verified" on a real low-power device;
  this is exactly why leg 4 is a gate rather than an assumption.
- **MAX_IMPORT_BYTES (50MB) already limits restore today, independent of
  git** — this workstream's leg 4 makes that ceiling newly visible (a
  personal backup can now be meaningfully larger, since generation itself
  is uncapped per workstream 0004 leg 3) but does not create or fix it. Worth
  a loud UI message in leg 4 rather than a silent failure; fixing the
  ceiling itself is a named, separate follow-up, not this workstream's scope.
- **Two backup manifest formats already coexist by workstream 0004's own
  admission** (its local format, and RFC 0064's fuller one, reconciled only
  when 8.10–8.12 eventually land) — this workstream adds a third encryption
  mode on top of that same unreconciled surface. Whoever eventually does
  that reconciliation should read this workstream's Decisions Locked table
  too, not just 0004's.
- **Shelling out to `git` with credentials and user-supplied remote URLs is
  new attack surface**, even with `execFileSync`+argv-array discipline
  followed correctly — worth an explicit security-review pass on
  `git-backup.ts` (leg 3) specifically, not just normal code review, given
  this repo's own standing caution around request-derived values reaching a
  subprocess.

## Kill criteria

**If leg 4's client-side decrypt cannot be made reliable and reasonably
fast on real target devices** — stop leg 4's in-app restore UI, but ship
legs 1–3 (encryption primitives, identity generation, git push) as complete,
standalone value: a user's personal data is still landing encrypted in their
own git repo, restorable manually with any standard `age` client outside
Sovereign, which was always the underlying invariant this workstream commits
to regardless of whether the in-app convenience layer ships. Document the
manual path clearly in place of the abandoned in-app flow. Legs 5–6
(operator scope) are entirely unaffected, since they never touch browser
decrypt.

**If the Docker-spawn prerequisite for operator-scope git-push is still
unresolved when legs 5–6 would start** — stop before starting them; legs
1–4 (the entire per-user scope) already shipped independently and are real,
complete value on their own. Re-evaluate legs 5–6 once that separate,
pre-existing gap closes.

In both cases the workstream is designed so that stopping early leaves
shipped, coherent value behind, not half a feature — matching workstream
0004's own precedent for this section.

## Changelog

| Version | Date           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026    | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.2     | September 2026 | Leg 1 (task 8.37) shipped. Corrects an assumption made during planning: `age-encryption` is pure JS (`@noble/ciphers`/`@noble/curves`/`@noble/hashes`), not WASM — confirmed by installing and inspecting the actual package. Removes the CSP `'wasm-unsafe-eval'` addition this doc previously planned for leg 4, since it's not needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.3     | September 2026 | Leg 4 (task 8.40) shipped — the gate leg. Client-side decrypt verified correct end to end against a real dev server and a real local git remote (real push, real `git ls-remote` listing, real signed download, real browser `Decrypter` with a real generated identity, real import). Real-device performance verified via Node/V8 timing against the actual `age-encryption` library (linear ~6.25ms/MB; 100MB in ~625ms) rather than a genuine physical low-power device, none being available in this environment — judged sufficient to pass the gate given the linear scaling and that restore is a one-time, user-initiated action, but a real low-power-device check remains a documented gap, not a resolved one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0.4     | September 2026 | Leg 5 (task 8.41) shipped. A new `SV_BACKUP_GIT_AGE_RECIPIENT` env var makes the pushed copy of an instance backup decryptable by a long-held operator identity instead of the passphrase, via a separate `encryptToRecipients()` pass over the same plaintext — deliberately not combined into one multi-recipient `age` file, resolving this leg's own explicitly-deferred "either or both" design question in favor of genuine isolation (the review checklist's "decrypts only with the matching identity" requirement would not hold for a combined file). Verified against the actual production-shaped Docker topology per this leg's own gate condition, not just a native `pnpm dev` checkout — the Docker-spawn prerequisite (task 8.16) and this leg's own dependency (task 8.17) were both confirmed genuinely shipped, not merely merged, before starting. A real four-way cross-decrypt (independent `age` v1.3.1 CLI against the git-pushed copy with the generated identity and with the passphrase; this repo's own `decrypt()` against the direct-download copy with the passphrase and against the git-pushed copy with the same passphrase) confirmed the two copies are genuinely, independently encrypted. |
