# Research 0013 — Layered Database Encryption Strategy (Wire, App-Level, and Zero-Knowledge)

**Status:** Decided\
**Date:** August 2026\
**Author:** kasunben & Claude Code\
**Scope:** `packages/db`, `packages/sdk`, `packages/manifest`, `runtime/src`, `docs/epics/data-sovereignty.md`\
**Related:** [RFC 0008](../rfcs/0008-security-encryption-architecture.md) (security & encryption architecture — Task 8.5 is the open dependency this doc feeds), [RFC 0060](../rfcs/0060-client-side-encryption-core.md) (client-side encryption core — already shipped, see Finding 3), [RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md) (SQLite at-rest encryption — retired from the live path, see Finding 1), [RFC 0091](../rfcs/0091-libsql-sqld-driver.md) (libSQL/sqld driver — the RFC whose implementation, PR #401, retired RFC 0071)

---

## Question

As of PR #401 (`f1099ba`, merged 2026-08-10), neither live database dialect — sqld-backed SQLite or PostgreSQL — has any application-level at-rest encryption. How should Sovereign protect sensitive plugin data against an untrusted or compromised database operator, without breaking search/sort and without giving up Sovereign's dialect portability between SQLite(sqld) and Postgres?

This supersedes the doc's original framing ("how do we add encryption to Postgres, given SQLite already has it") — that premise no longer holds; see Finding 1.

## Findings

1. **Neither dialect has at-rest encryption today.** `docs/upgrade.md` (post PR #401): _"Neither dialect has an application-level at-rest encryption option now; rely on disk/volume-level encryption if this matters for your deployment."_ [`packages/db/src/sqlite-encryption.ts:1-15`](../../packages/db/src/sqlite-encryption.ts#L1-L15) confirms RFC 0071 is retired from the live path — the file is trimmed to the legacy-read primitives `sv db migrate-to-postgres` still needs for a one-time conversion of a pre-this-change instance.

2. **RFC 0091 explored a narrower alternative before PR #401 chose full retirement.** RFC 0091 recommended a scoped carve-out — keep plain-file SQLite + SQLCipher only for databases that actually declare an encryption requirement, route everything else to sqld ([`0091:171-198`](../rfcs/0091-libsql-sqld-driver.md#L171-L198)) — and went further, building `libsql-server` from source with `--build-arg ENABLE_FEATURES=encryption` and confirming sqld's own native encryption-at-rest works correctly (round-trips, fails safely on a wrong key, no plaintext leakage into the WAL) ([`0091:200-218`](../rfcs/0091-libsql-sqld-driver.md#L200-L218), changelog v0.3). Neither the carve-out nor sqld's native encryption protects against an operator with a live, keyed connection — both only protect a stolen disk, the same ceiling as plain volume encryption. PR #401 chose full retirement over either option, treating operator-managed disk/volume encryption as the sole answer for both dialects going forward.

3. **The platform already provides real field/object-level encryption — client-side, not server-side.** [`packages/sdk/src/e2ee-object.ts:1-20`](../../packages/sdk/src/e2ee-object.ts#L1-L20) documents `encryptJson()`/`encryptBlob()`, each field/object encrypted under its own Data Encryption Key, itself wrapped under the user's Client Master Key (RFC 0060) — a live, working SDK capability, gated by the `e2ee:use` permission. Neither Postgres nor the Node runtime ever see plaintext for these fields — this is stronger than anything proposed below, but only usable where a plugin's UX can absorb client-key setup and giving up server-side compute over that data.

4. **A working precedent for server-side field encryption already exists, at a smaller scope.** [`runtime/src/secrets.ts:57-70`](../../runtime/src/secrets.ts#L57-L70) (`sdk.secrets`, the plugin vault) implements AES-256-GCM with a random IV, an AEAD auth tag, and additional authenticated data bound to `{tenantId, pluginId, scope, userId}` — preventing ciphertext from being replayed across contexts even by someone holding the key. Versioned envelope format (`sv1:iv:tag:ciphertext`), keyed by `SOVEREIGN_VAULT_KEY`. This is a solid pattern to extend, not a new crypto scheme to invent.

5. **The target API surface is already named, just unimplemented.** [`packages/sdk/src/types.ts:203`](../../packages/sdk/src/types.ts#L203) references `sdk.crypto.encryptField()` as the planned RFC 0008 field-level surface, explicitly distinct from RFC 0060's client-side methods. Task 8.5 ([`docs/epics/data-sovereignty.md:78-99`](../epics/data-sovereignty.md#L78-L99), still 📋 open) already scopes the real dependency: a KEK→DEK envelope hierarchy, `crypto:use` permission gating, and a documented search/sort caveat for encrypted columns.

6. **Postgres itself offers no real answer to the operator threat.** `pgcrypto` (ships in Postgres `contrib`, needs `CREATE EXTENSION`) passes its key through the query/connection — recoverable via query logging or `pg_stat_statements` — so it relocates the exposure rather than closing it. `pg_tde` and `pgsodium` aren't in the base `postgres:16-alpine` image (confirmed: no extensions enabled in `docker-compose.postgres.yml`), aren't supported by most managed Postgres providers, and — like TDE generally — decrypt transparently for any live, authenticated connection, so they only ever protect a stolen disk. Row-Level Security is access control, not encryption, and Postgres superusers bypass it by default.

7. **App-level field encryption is the only mechanism that structurally satisfies the operator threat**, because it moves the plaintext-to-ciphertext boundary outside Postgres's (and sqld's) process entirely — the database only ever stores and returns ciphertext. It's also dialect-portable for free: the ciphertext is just a string in an ordinary column, identical in `schema/sqlite/*.ts` and `schema/postgres/*.ts`, unlike `pgcrypto`'s Postgres-only SQL.

## Options considered

### Option 1: Disk/volume-level encryption (LUKS, cloud KMS)

- **Description:** encrypt the host disk or managed storage volume underneath either dialect.
- **Pros:** zero application code changes; protects stolen disks and leaked backups/snapshots; already the documented posture for both dialects post-PR-#401.
- **Cons:** doesn't protect against a live, authenticated connection — an operator with `psql`/sqld access sees plaintext regardless. Entirely outside the platform's control; operator-configured infrastructure, not something Sovereign builds.
- **Verdict:** keep recommending it in docs as the baseline for the disk-theft threat. It does not answer this doc's Question.

### Option 2: In-database encryption (`pgcrypto`, `pg_tde`, `pgsodium`)

- **Description:** encrypt inside Postgres itself, via extension functions or a table-access-method layer.
- **Pros:** `pgcrypto` ships in `contrib`, no custom image required for that one specifically; `pgsodium`/`pg_tde` offer more modern crypto and better key ergonomics than raw `pgcrypto`.
- **Cons:** none survive a Postgres superuser — `pgcrypto`'s key travels through the query/log surface; the TDE-style options decrypt transparently for any live connection, same ceiling as Option 1. `pg_tde`/`pgsodium` need a non-stock image and aren't available on most managed Postgres, breaking "bring your own Postgres." `pgcrypto` also loses standard indexing on encrypted columns and is non-portable SQL — no SQLite/sqld equivalent.
- **Verdict:** reject. Doesn't solve the stated threat, and costs real deployment flexibility to get there.

### Option 3: Row-Level Security

- **Description:** restrict which rows a role/connection can see.
- **Pros:** relevant to a different problem — cross-tenant/cross-plugin data isolation — which Sovereign's per-schema plugin isolation already mostly covers.
- **Cons:** not encryption; Postgres superusers bypass RLS by default. Doesn't touch the operator threat.
- **Verdict:** out of scope for this doc.

### Option 4: App-level field encryption (recommended — Layer 2)

- **Description:** encrypt specific fields in the Node.js app, before the write reaches either dialect, under a dedicated key hierarchy (not a reuse of `SOVEREIGN_VAULT_KEY`). Ship as `sdk.crypto.encryptField()`/`decryptField()`, backed by paired Drizzle helpers — `encryptedText()` for the ciphertext column, `blindIndex()` for an HMAC-SHA256 companion column enabling exact-match queries. Unencrypted metadata columns remain available for filter/sort; anything fuzzier falls back to in-app decrypt-and-filter.
- **Pros:** the only option that actually satisfies "the operator can't read this" — Postgres and sqld only ever store ciphertext. Dialect-portable by construction. Builds on the working `secrets.ts` AES-256-GCM/AAD pattern instead of inventing a new one.
- **Cons:** does **not** protect against a compromised app server — the key and the plaintext both pass through the Node process at encrypt/decrypt time; this is a residual risk to state plainly, not solve away. Loses standard indexing and fuzzy search on encrypted columns (mitigated, not eliminated, by blind indexes).
- **Verdict:** adopt as Layer 2 — see Recommendation for the scope model.

### Option 5: Client-side zero-knowledge encryption (RFC 0060 — already exists)

- **Description:** encrypt in the browser before data reaches the app server at all, per RFC 0060's CMK/DEK model.
- **Pros:** strongest protection available — removes the app server from the trust boundary too, not just the database. Already shipped as a working SDK capability, not just a design (Finding 3).
- **Cons:** opt-in, requires client-side key setup UX; the app cannot compute or search over that data server-side at all.
- **Verdict:** keep as Layer 3 — opt-in per plugin, for data where zero server-side visibility is worth the UX cost. Not a substitute for Layer 2; most plugin data doesn't warrant this cost.

## Recommendation

A three-layer model: TLS as the floor, app-level field encryption as the platform-wide default, zero-knowledge reserved for the highest-sensitivity plugins.

1. **Layer 1 — Wire (already done).** Mandatory TLS (`sslmode=verify-full`, `packages/db/src/client.ts`'s `pgSsl()`) — unchanged, confirmed as the production baseline.

2. **Layer 2 — App-level field encryption, platform-wide default by classification.** Ship `sdk.crypto.encryptField()`/`decryptField()` — completing the RFC 0008 surface already referenced in `types.ts` — backed by `encryptedText()`/`blindIndex()` Drizzle helpers, dialect-portable across SQLite(sqld) and Postgres. Scope model:
   - A plugin author **classifies** a field's sensitivity in schema code (e.g. `encryptedText({ sensitivity: 'pii' })`) — they don't decide whether it's actually encrypted.
   - An operator sets **instance-wide policy** (an env var at deploy time, or a first-run Console step — e.g. `SOVEREIGN_ENCRYPT_CLASSES=pii,health`) that decides which sensitivity classes are actually encrypted, across every plugin that classified a field that way — including third-party/registry plugins whose authors never thought about encryption at all.
   - Key management: a dedicated KEK→DEK hierarchy (Task 8.5), not a reuse of `SOVEREIGN_VAULT_KEY` — different threat surface (broad, routine data vs. a small number of high-value secrets), different rotation needs.
   - **Backfill is explicit, never automatic.** Turning on a sensitivity class encrypts new writes by default; re-encrypting already-existing plaintext rows across every plugin is a separate, operator-triggered migration (mirroring the old `sv db encrypt`), never something that fires silently on a version bump. This is a direct lesson from the RFC 0071 rollout incident (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`): a single instance-wide toggle with a large cross-plugin blast radius broke four unrelated plugins last time. The backfill step must stay contained and operator-initiated.

3. **Layer 3 — Zero-knowledge client-side encryption (already exists — no new engineering).** RFC 0060's CMK/DEK model, opt-in per plugin via `e2ee:use`. Document it as the recommended path for a plugin where zero server-side visibility is worth losing server-side search/compute. Which specific plugins adopt it is a per-plugin decision outside this doc's scope — the platform's job is providing and maintaining the capability, not choosing who uses it.

## Open questions

- **Sensitivity taxonomy.** What classes exist (`pii`, `health`, `financial`, …), who defines and maintains the list, and how is a third-party plugin's self-declared classification reviewed at registry-submission time? Real design work, not yet scoped.
- **Backfill migration mechanics.** What does an operator-triggered re-encryption pass actually look like across an arbitrary number of isolated plugin databases, live, without the downtime `sv db encrypt` used to require? Needs a spike.
- **Key rotation.** Task 8.5's KEK→DEK hierarchy is meant to make DEK rotation cheap without full re-encryption — needs validation against the blind-index design specifically, since rotating the blind-index HMAC key breaks every existing index value unless there's a dual-read transition period.

## Next steps

Graduate into an RFC extending RFC 0008's still-open Task 8.5, covering: the `sdk.crypto.encryptField()`/`decryptField()` surface, the `encryptedText()`/`blindIndex()` Drizzle helpers, the KEK→DEK envelope hierarchy, and the sensitivity-taxonomy + policy-flag design. The RFC should design the backfill migration as a bounded, operator-triggered step from day one — not bolt it on later, given the RFC 0071 precedent. Layer 3 (RFC 0060) needs no further RFC work — only continued documentation of when a plugin should reach for it over Layer 2.
