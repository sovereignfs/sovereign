# RFC 0097 — Severing attribution on account deletion

**Status:** Draft\
**Date:** September 2026\
**Author:** Claude Code\
**Scope:** `packages/sdk` (`DeletionResult.anonymized`), `docs/plugin-development.md`,
`docs/architecture-rules.md`, `CLAUDE.md`, and the schema/migrations/deletion handler of every
plugin holding cross-user attribution columns (`sovereign-shopper`, `sovereign-tasks` first);
**amends [RFC 0033](0033-user-data-deletion.md)** — it fills in the answer RFC 0033's "What is
NOT deleted" section deliberately left to each plugin, without changing RFC 0033's rule that the
platform does not impose one. RFC 0033 stays "Implemented" for everything it already covers.\
**Incorporated into plan:** No — documentation-first. Design plus the SDK/doc surface it needs;
per-plugin adoption is scheduled separately.

---

## Summary

When an account is deleted, a plugin's `sdk.portability.provideDelete` handler removes the rows
that user owned. Rows the departing user authored **on another user's data** are a different
case: they must survive — the row belongs to the other user's list, board, or ledger — but they
keep the deleted account's id in an attribution column, pointing at a user who no longer exists.

This RFC sets one platform-wide answer: a cross-user attribution column is **nullable**, and a
deletion handler **sets it to `NULL`** — severing the attribution instead of deleting the row.
Handlers report those rows through a new optional `DeletionResult.anonymized` count so the
cascade never reports a severed row as an erased one. It explicitly rejects the alternative of a
platform-wide "deleted user" sentinel id.

## Motivation

Two plugins have independently hit the identical gap and both, correctly, declined to invent an
answer:

- **Shopper** — `shopper_list_items.added_by` and `shopper_purchases.purchased_by` on lists the
  departing user only had editor access to are never touched, because
  `deleteAllShopperData` scopes every statement by `owner_user_id`. The handler's own doc comment
  records the gap and names the two candidate designs, deferring both as "decisions bigger than
  this plugin."
- **Tasks** — `assignee_id` has the same shape, noted in Shopper's `portability.ts` import
  comment as the reason not to decide unilaterally.

[RFC 0096](0096-plugin-deletion-veto-hook.md) surveyed the same territory from the other end and
found the pattern is not confined to those two: **Tally**, **Docs**, **Sheets**, and **Kanban**
all hold rows where one user's record references another user. RFC 0096's answer is to let a
plugin _block_ a deletion before it starts. This RFC is its complement: what a plugin does with
attribution _after_ a deletion it did not block. The two are independent — a plugin may need
either, both, or neither.

RFC 0033 already anticipated this case and ruled on it correctly:

> **Shared / aggregate data** that references the user only by attribution (e.g. plugin content
> visible to other users): plugin handlers decide; the platform does not impose.

That is right about _enforcement_ — the platform cannot know which of a plugin's rows are
shared. But "plugins decide" was read as "no guidance exists," and the result is two plugins
sitting on the same unresolved question waiting for a convention that was never written. This
RFC writes the convention. It does not make the platform impose it.

**This is not urgent as a leak.** Nothing in either plugin's UI renders these columns today, so
what exists is a dangling id in a table, not a visible disclosure. The reason to fix it now is
that the cost only rises: the migration is cheap while the columns are write-only, and expensive
once a UI, an export consumer, or Shopper's v0.7 price history starts reading them.

## Current state (what this builds on)

- **The gap, as written down.**
  `plugins/sovereign-plugin-shopper.local/app/_lib/portability.ts:380-397` documents it in full,
  including that deleting the rows would be wrong. `added_by` and `purchased_by` are
  `.notNull()` (`app/_db/schema.ts:93,111`; `app/_db/schema.postgres.ts:79,97`).
- **These columns are already soft references.** Neither has a foreign key, and neither can: the
  `user` table lives in `apps/auth`'s own `sovereign_auth` schema/database, not the plugin's. An
  id in one of these columns has _always_ been "a user who may or may not still exist" — an
  admin deleting a user has left dangling ids here since the column was created. Any read path
  must already handle "resolves to nobody."
- **The platform already models this exact concept, with NULL.** `activity_log.actor_id` is
  nullable, paired with a non-null `actor_type` discriminator (`'user' | 'system' | 'plugin'`) —
  `packages/db/src/schema/sqlite/platform.ts:200-201`. Workstream 0025 leg 1 (`GDPR-1`) used
  precisely this to make a self-deletion's own audit record survive the cascade: the entry is
  written with `actorType: 'system'` and `actorId: null` rather than the deleted user's id.
- **The rendering fallback already exists.** `plugins/console/app/activity/page.tsx:68-71`
  renders `actorType === 'system'` as `"System"` and a null `actorId` as no actor label at all.
- **`sdk.directory.resolveUsers()` resolves only active users.** Ids with no live user are
  simply absent from the result (`packages/sdk/src/directory.ts`,
  `runtime/src/sdk-host.ts:732-745`) — it does not throw and does not return a placeholder. A UI
  rendering any stored user id therefore already needs an unresolved-id branch.
- **Nullable soft links are already the documented idiom.** `docs/plugin-development.md`'s
  cross-plugin reference section tells plugins to "treat a stored reference as a nullable link
  and handle the provider being uninstalled, disabled, revoked, or the resource deleted."
- **`DeletionResult` is `{ deleted: number; errors?: string[] }`**
  (`packages/sdk/src/portability.ts:100-106`), surfaced per plugin in `DeletionSummary.
pluginResults` (`runtime/src/user-deletion.ts:21-34`). Nothing in the runtime or Console
  aggregates or renders `deleted` today; it is carried for the operator-facing summary.
- **drizzle-kit generates the SQLite relaxation itself.** SQLite has no `ALTER COLUMN`, but
  `drizzle-kit generate` emits the standard `PRAGMA foreign_keys=OFF` → create `__new_*` → copy →
  drop → rename rebuild. This repo already ships that exact generated pattern in
  `plugins/sovereign-plugin-travellog.local/migrations/sqlite/0002_vengeful_wind_dancer.sql:76-100`.
  The hand-authoring rule in `CLAUDE.md` applies to _renames_, which drizzle-kit cannot do
  non-interactively; a nullability relaxation is not a rename and needs no hand-authoring.

## Proposed design

### 1. The three-way classification

Every row a plugin holds falls into exactly one of three buckets at deletion time. Stating them
explicitly is most of the value of this RFC — the Shopper and Tasks gaps are both bucket 2 rows
that were handled as though only buckets 1 and 3 existed.

| #   | Row                                                         | Action                                  |
| --- | ----------------------------------------------------------- | --------------------------------------- |
| 1   | Owned by the departing user                                 | **Delete**                              |
| 2   | Owned by another user, **attributed to** the departing user | **Sever the attribution, keep the row** |
| 3   | Owned by another user, not attributed to the departing user | Leave untouched                         |

The distinction that matters is **ownership vs. attribution**:

- An **ownership** column (`owner_user_id`, `user_id`, `tenant_id`) says whose data this is.
  It stays `NOT NULL`. Its rows are bucket 1 — deleted outright. An ownership column is never
  severed, because a row with no owner is unreachable garbage.
- An **attribution** column (`added_by`, `purchased_by`, `assignee_id`, `created_by`,
  `checked_by`) says who _did something_ to a row someone else owns. It is nullable, and it is
  what this RFC severs.

A column can be both, in different tables. `shopper_lists.created_by` is attribution on a list
whose `owner_user_id` is someone else, and co-owned with the owner otherwise — so it follows the
row: severed when the list survives, deleted with the list when it does not.

### 2. Sever means `NULL`

A cross-user attribution column is declared nullable, and the deletion handler sets it to `NULL`.

```ts
const severed = await db
  .update(shopperListItems)
  .set({ addedBy: null })
  .where(
    and(eq(shopperListItems.tenantId, ctx.tenantId), eq(shopperListItems.addedBy, ctx.userId)),
  );
```

Why `NULL` rather than a sentinel:

- **It is what the platform already does.** `activity_log.actor_id` is nullable for exactly this
  reason, and `GDPR-1` chose `actorId: null` over a synthetic actor id when it faced the same
  question three legs ago. A second, different convention for one concept is drift.
- **The type system enforces the read side.** Relaxing the column changes the inferred type to
  `string | null`, so `tsc` names every site that reads it. A sentinel leaves the type as
  `string`; every existing read site keeps compiling and silently renders a meaningless token.
  The failure mode a sentinel is meant to prevent is the one it quietly preserves.
- **SQL treats it correctly for free.** `WHERE added_by = ?` never matches, `GROUP BY` does not
  invent a phantom contributor, `COUNT(added_by)` excludes it. A sentinel must be excluded by
  hand in every aggregate, filter, and join, forever, in every plugin — an allowlist with no
  compiler backing and no test that fails when someone forgets.
- **It cannot be mistaken for a real id.** A sentinel is a string shaped exactly like a user id
  that resolves to no user. Anything that treats it as an id — a directory lookup, an "is this
  me?" check, an export, a cross-plugin reference — does the wrong thing unless it has been
  taught the exception.

### 3. The sentinel buys nothing on the read path

The strongest argument for a sentinel is that it gives the UI a value to recognise, so it can
render "Deleted user" instead of a blank. That argument does not survive contact with
`resolveUsers`.

`sdk.directory.resolveUsers()` returns rows for active users only. A deleted user's id is absent
from the result whether that id is the original one, a sentinel, or nothing at all. The UI's
branch is "this id resolved to no user" in every case — **and it needs that branch regardless of
this RFC**, because an admin-deleted user has always left ids behind. Since the rendering rule is
identical under both designs, the sentinel's only claimed advantage is not an advantage, and its
costs (above) are unmatched.

The remaining honest argument for the sentinel is that it needs no migration. Section 6 addresses
that: for SQLite drizzle-kit generates the rebuild, and this repo already ships one.

### 4. The rendering rule

A plugin rendering an attribution column resolves it through `sdk.directory.resolveUsers()` and
handles two cases, which it must not conflate:

| Value                                | Meaning                                        | Render                          |
| ------------------------------------ | ---------------------------------------------- | ------------------------------- |
| `null`                               | Attribution deliberately severed, or never set | Omit the byline entirely        |
| non-null, absent from `resolveUsers` | Points at a user who is gone or not visible    | A neutral label, e.g. "Someone" |

**Omit, do not invent.** A severed row should read "Milk", not "Milk — added by Deleted User".
The point of erasure is that the departed user is not a lingering presence in someone else's UI,
and a "Deleted user" byline on every row is a worse outcome for both parties than no byline. This
is the same call `plugins/console/app/activity/page.tsx:71` already makes for a null `actorId`.

The non-null-but-unresolved case is not created by this RFC and is not fixed by it; it is listed
so plugins do not collapse the two into one branch and start rendering "Someone" on rows whose
attribution was deliberately removed.

### 5. Reporting: `DeletionResult.anonymized`

`DeletionResult` gains one optional field:

```ts
export interface DeletionResult {
  /** Number of rows (or objects) deleted. */
  deleted: number;
  /**
   * Rows kept but stripped of their attribution to the deleted user (RFC 0097) —
   * counted separately because they were not erased.
   */
  anonymized?: number;
  /** Non-fatal errors encountered during cleanup. */
  errors?: string[];
}
```

Severed rows must **not** be folded into `deleted`. `deleted` is the count an operator would cite
to evidence an erasure request; a severed row still exists, and reporting it as deleted overstates
what happened. This is the same accountability distinction workstream 0025 drew for `GDPR-1`
(Art. 5(2)/Art. 30 accountability, separate from erasure completeness).

The field is optional and additive: existing handlers are unchanged and existing readers see
`undefined`. It flows to the operator with no runtime change, since `DeletionSummary.
pluginResults[].result` already carries the whole `DeletionResult`.

### 6. Migration path for an already-shipped `NOT NULL` column

Per dialect, generated not hand-authored:

- **Postgres** — `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL`.
- **SQLite** — the standard drizzle-kit table rebuild, generated automatically.

The two `drizzle-kit generate` runs are the plugin's existing `db:generate:sqlite` /
`db:generate:pg` scripts. This is a widening change: every existing row stays valid, nothing is
backfilled, and no data is rewritten at migration time.

### 7. What this does not do

- **It does not make the platform enforce anything.** RFC 0033's "plugin handlers decide" stands.
  There is no runtime check that a handler severed anything, and none is proposed: the platform
  cannot tell an ownership column from an attribution column in a plugin's schema.
- **It does not retro-clean existing dangling ids.** Rows already carrying a deleted user's id
  keep it. A plugin that wants them cleaned needs its own one-off migration, which it can only
  write if it can still enumerate deleted user ids — generally it cannot. Adopting this RFC fixes
  deletions from adoption onward.
- **It does not touch export/import.** A severed `null` exports as `null`; import already
  rewrites attribution to the importing user.

## Alternatives considered

**A platform-wide "deleted user" sentinel id** (e.g. `SOVEREIGN_DELETED_USER_ID` exported from
`@sovereignfs/sdk`, written into `NOT NULL` attribution columns). **Rejected.** It needs no
migration, which is its only real advantage. Against that: it is invisible to the type system, so
no read site is forced to handle it and every existing one keeps compiling while rendering a
meaningless token; it must be excluded by hand from every filter, aggregate, and lookup in every
plugin forever, with nothing that fails when someone forgets; it introduces a value shaped like a
user id that resolves to no user, which anything treating it as an id will mishandle; and it
diverges from `activity_log.actor_id`, where the platform already answered this question with
`NULL`. Its headline benefit — "a value the UI can recognise" — is not real: `resolveUsers()`
returns nothing for it just as for any other id, so the UI's branch is unchanged (§3).

**Deleting the rows outright.** Rejected, and already rejected in Shopper's own handler comment:
the item belongs to the list owner's shopping list and the purchase to their ledger (Shopper v0.7
price history reads it). Deleting another user's row to erase a third party's attribution
corrupts data the platform has no claim to — the corruption case RFC 0096 was written about.

**Leaving it to each plugin** (status quo). Rejected: it is exactly what produced two plugins
independently blocked on the same question, each declining to set a precedent unilaterally.

**A platform-enforced sweep** — the runtime nulling attribution columns itself after the cascade.
Rejected: the platform cannot distinguish an ownership column from an attribution column in a
plugin's schema, and guessing by column name across isolated per-plugin databases would be both
unreliable and a direct violation of RFC 0033's "the platform does not impose."

## Semver impact

| Package                      | Bump  | Version               | Reason                                                                                                    |
| ---------------------------- | ----- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `@sovereignfs/sdk`           | minor | `1.51.0` → `1.52.0`   | Additive optional `DeletionResult.anonymized`; no member added to `SdkHost`, so no mock-host stubs needed |
| `sovereign-shopper` manifest | minor | `0.5.0` → `0.6.0`     | Nullable `added_by`/`purchased_by` + migrations + handler                                                 |
| `sovereign-tasks` manifest   | minor | —                     | Same change for `assignee_id`, in its own repo                                                            |
| Root `package.json`          | minor | `0.138.3` → `0.139.0` | One completed task                                                                                        |

`DeletionResult` is a return type a plugin _produces_, never one it consumes, so adding an
optional field cannot break an existing handler. It is a minor, not a patch, because it widens a
published contract (NFR-04).

## Security considerations

- **Severing is not erasure, and must not be reported as such.** §5 is the security-relevant part
  of this design: an operator answering an erasure request needs to know a row survived. Folding
  severed rows into `deleted` would make the cascade's own summary misleading.
- **A severed row can still identify its author indirectly.** Free-text content, timestamps, and
  co-occurrence can re-identify a contributor to a small shared list regardless of the id being
  gone. This RFC removes the direct identifier only; it does not claim anonymity in the GDPR
  Recital 26 sense, and no plugin should describe it to users as though it did.
- **No new authorization surface.** Severing happens inside an existing `provideDelete` handler,
  already scoped to `ctx.userId`/`ctx.tenantId`, already invoked only by the runtime's cascade.
  A handler must still scope its `UPDATE` by `tenant_id` exactly as it scopes its `DELETE`s —
  an unscoped `WHERE added_by = ?` would cross tenants.

## Review checklist

```bash
# Deletion handler: rows owned by the user are deleted
# Deletion handler: rows on OTHER users' lists attributed to the user are kept, attribution NULL
# Deletion handler: rows on other users' lists NOT attributed to the user are untouched
# Deletion handler: severed rows counted in `anonymized`, never in `deleted`
# Deletion handler: the severing UPDATE is scoped by tenant_id
# Migration (sqlite): drizzle-kit rebuild applies; existing rows survive with values intact
# Migration (postgres): DROP NOT NULL applies; existing rows survive
# A regression test fails against the pre-fix handler
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

## Changelog

- **v0.1** (September 2026) — Initial draft.
