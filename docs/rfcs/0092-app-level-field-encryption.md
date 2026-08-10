# RFC 0092 — App-Level Field Encryption (Platform-Wide by Classification)

**Status:** Draft\
**Date:** August 2026\
**Author:** kasunben & Claude Code\
**Scope:** `packages/sdk`, `packages/db`, `packages/manifest`, `runtime/src`, `bin/sv`, `.env.example`, `docs/self-hosting.md`, `docs/plugin-development.md`; narrows and partially supersedes RFC 0008's Tier 2/3 scope (epic task 8.5); builds on [Research 0013](../research/0013-layered-database-encryption-strategy.md)\
**Incorporated into plan:** No — documentation-first. Design and task breakdown (epic tasks 8.31–8.34, workstream 0011); implementation starts on acceptance.

---

## Summary

Add server-side field encryption as a platform capability: plugin authors **classify** a column's sensitivity in schema code; the operator sets an **instance-wide policy** deciding which sensitivity classes are actually encrypted. Classified fields are encrypted in the Node.js app tier (AES-256-GCM, per-class Data Encryption Keys wrapped under a master Key Encryption Key) before any write reaches the database, so Postgres and sqld only ever store ciphertext. Exact-match querying over encrypted fields is preserved via HMAC-SHA256 blind-index companion columns.

This is Layer 2 of Research 0013's three-layer model — the answer to the threat neither disk encryption nor anything inside the database can address: a database operator with a live, authenticated connection. Layer 1 (TLS) is already shipped; Layer 3 (RFC 0060's client-side zero-knowledge encryption) already exists as an opt-in SDK capability and is unchanged by this RFC.

## Motivation

Since the sqld cutover retired RFC 0071's SQLCipher path, **neither dialect has any application-level at-rest encryption** — `docs/upgrade.md` directs operators to disk/volume encryption, which only protects a stolen disk. A Sovereign instance's database operator (or anyone who compromises the database container) can read every user's data in plaintext with a standard client. For a privacy-first, self-hosted product whose plugin registry is open to third-party authors, "every plugin author must independently remember to protect sensitive data, with no platform mechanism to do it" is not a defensible posture.

The classification/policy split is deliberate: the plugin author is the only party who knows what a column _holds_, but the operator is the only party who knows the instance's threat model. Separating the two means a third-party plugin from the registry — whose author never thought about encryption — still gets its `pii`-classified fields protected on any instance whose operator turned that class on.

## Current state (what this builds on)

- **No live at-rest encryption in either dialect.** `packages/db/src/sqlite-encryption.ts:1-15` — RFC 0071 retired; only legacy-read primitives for `sv db migrate-to-postgres` remain.
- **A working AES-256-GCM envelope pattern already ships.** `runtime/src/secrets.ts:57-70` (`sdk.secrets`): random 12-byte IV, AEAD auth tag, AAD bound to `{tenantId, pluginId, scope, userId}`, versioned envelope string (`sv1:iv:tag:ciphertext`), keyed by `SOVEREIGN_VAULT_KEY` with a fail-fast malformed-key loader. This RFC extends that shape, not a new scheme.
- **The API surface is already named.** `packages/sdk/src/types.ts:203` references `sdk.crypto.encryptField()` as the planned RFC 0008 Tier 3 surface; the `crypto:use` permission is reserved in SRS §5. Neither is implemented.
- **Task 8.5 scoped the dependency but is partly obsolete.** Its Tier 2 SQLCipher deliverables died with RFC 0071's retirement; its KEK→DEK envelope key management and Tier 3 field-level scope are what this RFC now carries (see the scope note added to task 8.5).
- **RFC 0060 client-side encryption is live** (`packages/sdk/src/e2ee-*.ts`, `e2ee:use` permission) — the stronger, opt-in tier for data where zero server-side visibility justifies losing server-side compute. This RFC does not change it.
- **In-database options were evaluated and rejected** in Research 0013: `pgcrypto` leaks its key through the query/log surface; `pg_tde`/`pgsodium` need non-stock images unavailable on managed Postgres; all of them, plus RLS, are defeated by a live superuser connection.

## Proposed design

### Sensitivity taxonomy

A closed initial enum, deliberately small:

| Class       | Intended contents                                                            |
| ----------- | ---------------------------------------------------------------------------- |
| `pii`       | Directly identifying personal data: names in free text, addresses, birthdays |
| `health`    | Health, medical, and wellbeing data                                          |
| `financial` | Financial records, account details, transaction descriptions                 |
| `sensitive` | Catch-all for data the author judges sensitive but unclassifiable above      |

Extending the enum is a platform change (minor SDK bump), not something plugins can do ad hoc. Registry submission review covers whether a plugin's classifications are plausible — same trust model as its permission list.

### Classification: schema helpers

Two paired helpers, exported from `@sovereignfs/sdk` (plugins may only import the SDK — the ESLint boundary rule):

```ts
import { encryptedText, blindIndex } from '@sovereignfs/sdk';

export const journalEntries = sqliteTable('healthjournal_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  loggedAt: integer('logged_at').notNull(), // plaintext metadata — filter/sort freely
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }), // exact-match lookups only
});
```

`encryptedText()` wraps drizzle's `text()` via `customType`, attaching sensitivity metadata the write path reads; `blindIndex()` declares an HMAC-SHA256 companion column maintained automatically alongside its source. Both are dialect-portable by construction — the stored value is an ordinary string in both `schema/sqlite/*.ts` and `schema/postgres/*.ts`. The SDK's zero-deps rule (`no @sovereignfs/db`, no `@sovereignfs/mailer`) holds: the helpers depend only on `drizzle-orm`, which every plugin with a schema already has; the crypto itself is host-provided via `provideHost()` like every other SDK implementation.

### Enforcement: operator policy

`SOVEREIGN_ENCRYPT_CLASSES` — a comma-separated list of enabled classes (e.g. `pii,health`). Classes not listed are stored plaintext even if classified; an empty/unset value means no field encryption (safe default for existing instances; no behavior change on upgrade). Read at startup; `.env.example` + `docs/self-hosting.md` + docs-parity in the same PR per convention. Console → Settings later gains a read-only display of the active policy (not an editable toggle in this pass — changing policy has migration implications, below).

Turning a class **on** encrypts _new writes_ from that point. It never silently rewrites existing rows — backfill is a separate, explicit, operator-triggered step (`sv db encrypt-fields`). This is a direct lesson from the RFC 0071 rollout incident (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`): an instance-wide toggle must never fan out into cross-plugin bulk mutation as a boot side effect.

### Key hierarchy

- **KEK:** `SOVEREIGN_FIELD_KEK` env var — 32 bytes, same encoding and fail-fast loader discipline as `SOVEREIGN_VAULT_KEY` (`runtime/src/secrets.ts`), no default. Required only when `SOVEREIGN_ENCRYPT_CLASSES` is non-empty; boot fails loudly if the policy is set without the key. Deliberately **not** a reuse of `SOVEREIGN_VAULT_KEY`: the vault protects a handful of high-value secrets; field encryption covers broad routine data — different rotation cadence, different blast radius.
- **DEKs:** one per (sensitivity class × plugin), generated on first use, wrapped under the KEK, stored in a platform table. Per-plugin scoping bounds a leaked DEK's blast radius to one plugin's slice of one class, and lets a plugin's data be re-keyed independently.
- **Blind-index keys:** a separate HMAC-SHA256 key per (class × plugin), same wrap/store lifecycle — never the DEK itself, so revealing an index key never reveals ciphertext contents.
- **Rotation:** `sv keys rotate-field-kek` re-wraps every DEK under a new KEK — no bulk data re-encryption, minutes not hours. DEK rotation (which _does_ require re-encrypting that DEK's rows) rides the same machinery as backfill.

### Envelope format

`svf1:<dekId>:<iv>:<tag>:<ciphertext>` (base64url segments) — the `secrets.ts` shape plus an explicit DEK identifier, so rotation and per-plugin keys resolve without guesswork. AAD binds `{tenantId, pluginId, class, column}` — a ciphertext lifted from one column/plugin/tenant fails authentication anywhere else, even with the right DEK.

### SDK surface and permission

`sdk.crypto.encryptField(value, { sensitivity })` / `sdk.crypto.decryptField(envelope)` — implemented host-side (`runtime/src/sdk-host.ts`), gated by the `crypto:use` manifest permission (already reserved in SRS §5). The schema helpers route through the same host implementation; direct SDK calls exist for values that never live in a drizzle column (blob metadata, export payloads).

### Search and sort caveats (documented, not hidden)

Encrypted columns lose `LIKE`/range/ORDER BY. The supported patterns, in `docs/plugin-development.md`:

1. **Blind index** — exact match only (`WHERE notes_bidx = hmac(term)`).
2. **Plaintext metadata** — keep non-sensitive dates/categories/IDs unencrypted and filter on those.
3. **Decrypt-and-filter in the app** — the fallback for fuzzy search, with its cost stated plainly.

### What this does not protect against

A compromised **app server** sees plaintext and keys at encrypt/decrypt time — that boundary is Layer 3's (RFC 0060) job, at Layer 3's UX cost. The docs state this plainly, mirroring task 8.5's original review-checklist language ("server-held keys do not defend against a curious operator or RCE" — of the _app_ host).

### Docker/config impact

Two new env vars (`SOVEREIGN_FIELD_KEK`, `SOVEREIGN_ENCRYPT_CLASSES`) → `.env.example`, `docker-compose.prod.yml` pass-through, `docs/self-hosting.md`, docs-parity test. Set identically on `runtime` and `auth`? **No** — auth's better-auth tables are not plugin schema and are out of scope for this pass (open question 3). No native deps; `node:crypto` only.

## Alternatives considered

- **Disk/volume encryption only (status quo).** Protects stolen disks; useless against a live connection. Remains the documented baseline for the disk-theft threat — it is not displaced, just insufficient alone.
- **In-database: `pgcrypto` / `pg_tde` / `pgsodium` / RLS.** Rejected in Research 0013 — key exposure via query logging (`pgcrypto`), non-stock images unavailable on managed Postgres (`pg_tde`/`pgsodium`), and all decrypt transparently for any authenticated connection. RLS is access control, superuser-bypassed, not encryption.
- **Opt-in per-field with no policy layer** (author alone decides, à la `e2ee:use`). Simpler, matches precedent — but coverage then depends on every registry author's diligence, which is exactly the gap. The classification/policy split keeps the author's knowledge and the operator's authority separate.
- **Per-user DEKs** (task 8.5's original Tier 3 sketch) instead of per-class×plugin. Stronger isolation, but explodes key count, complicates blind indexes (an index over rows of many users needs one HMAC key anyway), and blocks any legitimate cross-user server-side operation. Per-class×plugin is the tractable middle; per-user protection is Layer 3's territory.
- **Reusing `SOVEREIGN_VAULT_KEY`.** One less env var, but couples the rotation/compromise story of routine field data to high-value secrets. Rejected.

## Open questions

1. **Taxonomy sign-off.** The four-class enum above is a proposal; it needs kasunben's explicit approval before the manifest/SDK enum lands (workstream 0011 gate A).
2. **Blind-index key rotation.** Rotating an HMAC key invalidates every stored index value. Proposed: dual-read transition (query matches old _or_ new HMAC while a background re-index runs), designed in detail before leg 4 (gate B).
3. **Auth-store fields.** better-auth owns `apps/auth`'s schema; classifying its columns means patching generated tables. Deferred — out of scope for this RFC, tracked as a follow-up once the plugin-side machinery is proven.
4. **Export/backup interaction.** `sv backup` archives ciphertext (fine — the KEK travels via env, documented). But RFC 0007 user data **export** should emit plaintext (the user's own data, requested by the user) — the export path must decrypt through the same host service. Believed handled by routing exports through `sdk.crypto`; verify during leg 3.

## Adoption path

Documentation-first now. On acceptance: workstream 0011 (four legs = epic tasks 8.31–8.34 — key service, SDK surface + permission, schema helpers + policy, backfill tooling). New SDK exports (`encryptedText`, `blindIndex`, `sdk.crypto.*`) and the new `crypto:use` permission value are **minor** `@sovereignfs/sdk` and `@sovereignfs/manifest` bumps (additive, NFR-04-compliant). No breaking changes for existing plugins or operators: unset policy = current behavior exactly.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
