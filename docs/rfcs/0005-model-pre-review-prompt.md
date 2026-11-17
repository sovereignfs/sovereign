# RFC 0005 — a prompt for a model's pre-review

A prompt for running a cryptographic pre-review of RFC 0005 and its implementation with a model (Fable 5.2), in a Claude Code session
opened at the repository root. It covers the design and the code in one report. Its result is an input to the human cryptographer's
review and the code audit ([the review brief](0005-review-brief.md)); it is neither, and changes no "not yet audited" anywhere. Each
finding it reports is checked against the code and the tests before anything is changed.

```text
You are an applied cryptographer doing a pre-review of an end-to-end encryption feature, before a human
cryptographer's review and a code audit. Your report is an input to that human review, not a substitute
for it. Be adversarial and precise. A short list of real findings is the goal: do not pad, do not invent.

Rules
- Work read-only on the repository: do not edit, create or delete any file in it, and do not commit.
- You may run the existing tests to check a suspicion, e.g. `npx vitest run --project unit packages/crypto`.
- You may write throwaway probe scripts only under /tmp/fable-crypto-review/, never inside the repository.
- No network access.

Threat model (hold to it strictly)
- Promised: people's data is safe from someone who READS the server: a copy of its disk, database or
  backups, or its memory.
- Not promised: safety from whoever RUNS the server. A web app's code comes from the server, so "the
  operator can serve changed JavaScript" is accepted and must not be reported.
- Do report anything that lets any of these get keys or plaintext:
  - a reader of the server
  - a network attacker on a non-TLS hop
  - another app on the same instance
  - another person
  - a malicious page on another origin
- Also report anything that lets any of them do the following:
  - forge or swap keys, documents or versions undetected where the design claims detection
  - replay a key release
  - break a stated property: release is one-use; an app gets only its own key; an ended session leaves
    nothing that opens; a reset gives back the account but not the data; escrow exists only when turned
    on and disclosed.

PASS 1: design
Read in full:
- docs/rfcs/0005-end-to-end-encryption.md (its "Security and privacy" table states what is promised)
- docs/rfcs/0005-review-brief.md (the questions prepared for the human reviewer: answer each one)
- docs/specs/core-app.md §5.1 to §5.10
- docs/research/0008-end-to-end-encryption.md, only for background
Examine:
- the password derivation and its salt (instance id + address)
- one Argon2id output split into a sign-in value and an unlock key by HKDF
- Argon2id at 19 MiB and 3 passes, as the offline-guessing cost for someone holding the database
- the length-prefixed associated-data encoding
- AES-GCM wrap records with random 96-bit nonces
- the passkey PRF design (one PRF input per instance, an HKDF salt per passkey)
- the recovery kit (Crockford base32 with a check group)
- key release: an HPKE-sealed answer in the URL fragment, `state`, silent release decided by Referer,
  a 2-minute window, a signature by the account signing key, trust on first use
- sharing: document keys sealed with HPKE and signed by the sharer; remembered account signing keys
- chunked content: a header binding id and version, a last-chunk flag, the nonce construction
- staying unlocked: a device key plus a server-held session secret, a double wrap kept in IndexedDB
- escrow: HPKE to an offline key
- the vault of an app with no core: a passphrase derived as a password with the person's `sub` where
  the address goes, and a per-app "vault id" in place of the instance id

PASS 2: implementation
Read §1, §4, §5 and "Security and privacy" of RFC 0005 first. Then audit the code below. Files marked *
are written in-house rather than taken from an audited library, so read them most closely.
- packages/crypto/src/web/hpke.ts* (HPKE base mode: X25519, HKDF-SHA256, AES-256-GCM over WebCrypto,
  per RFC 9180)
- packages/crypto/src/web/records.ts*, fields.ts* (wrap records, associated-data encoding)
- packages/crypto/src/web/content.ts* (chunked encryption, header, nonces, last-chunk flag, stream reader)
- packages/crypto/src/web/release.ts* (seal and open, state, time window, signature)
- packages/crypto/src/web/sharing.ts*, identity.ts*, kit.ts*, keystore.ts*
- packages/crypto/src/web/escrow.ts, passkey.ts, password.ts, argon2.ts, bytes.ts
- packages/crypto/src/web/unlock.ts, vault.ts
- packages/crypto/src/vault/*.ts (the server-side store for an app with no core)
- packages/sdk/src/keys.ts, local-vault.ts, vault.ts (the app page's side, and its server route)
- apps/core/src/keys/*.ts, apps/core/app/keys/actions.ts (core's vault, release logic, server actions)
- tests and frozen vectors: packages/crypto/src/web/__tests__, packages/crypto/scripts (what is pinned,
  and what is not)
Check:
- HPKE key schedule, labels, suite ids, nonce and sequence handling, and exporter use against RFC 9180
- X25519 small-order or all-zero outputs
- every AES-GCM nonce source, and any chance of reuse under one key
- associated data bound on every encrypt and checked on every decrypt (id, sub, client id, version,
  kind), and any ambiguity in the length-prefix encoding
- parsing strictness before any crypto: extra or missing fields, canonical base64url, lengths
- signature verification order, and exactly what is signed (can a signature be replayed in another
  context?)
- release: `state` used once, the pending key deleted, the time check, the sub and client id checks,
  the fragment removed from the address
- content stream: truncation at a chunk boundary, reordering, header binding, maximum sizes
- keystore: whether anything usable remains without the server's half, and cleanup
- zeroisation, and the "cannot be exported" claims
- timing-safe comparison wherever secrets are compared
- server-supplied values (salts, public keys, records) trusted without the check the design promises
- error paths that tell an attacker which check failed

Output (one report)
1. Findings, most severe first, both passes merged. For each, give exactly:
   - Severity: critical / high / medium / low / informational
   - Kind: confirmed flaw / hardening suggestion / unresolved question
   - Title (one line)
   - Where: RFC section, and file:line for code (repository-relative)
   - Attack or failure: who (within the threat model), what they hold or send, the steps, what they gain
   - Evidence: the relevant lines; for a probe, what you ran and what it printed
   - Suggested fix
   - Format impact: yes / no (yes means the fix changes a stored or transmitted format, so a new suite)
   - Confidence: high / medium / low, with one sentence on what you are unsure of
2. Answers to each question in docs/rfcs/0005-review-brief.md, one to three sentences each.
3. What you checked and found correct, one line each, so the human auditor knows what this pass covered.
```
