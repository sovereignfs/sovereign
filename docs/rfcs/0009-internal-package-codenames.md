# RFC 0009 — Internal package codenames

**Status:** Withdrawn (deferred)\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/ui` → `mosaic`, `packages/mailer` → `dispatch`, `packages/db` → `database`; all importers; both `next.config.ts`; `eslint.config.ts`; `runtime/src`; docs (CLAUDE.md, design-system, plugin-development, architecture)\
**Incorporated into plan:** No — **withdrawn/deferred** at this time (decision-log row in SRS §6). The names (`ui`→`mosaic`, `mailer`→`dispatch`, `db`→`database`) are not adopted; the pre-publish rename window stays open (nothing is on npm yet), so this can be revisited before first npm publish without breakage.

---

## Summary

Give three workspace packages **memorable codenames** under the existing
`@sovereignfs/*` scope, while it is still free to do so — **before** anything is
published to npm:

| Today                 | Becomes                     | Role                                          |
| --------------------- | --------------------------- | --------------------------------------------- |
| `@sovereignfs/ui`     | **`@sovereignfs/mosaic`**   | Design system (components + `--sv-` tokens)   |
| `@sovereignfs/mailer` | **`@sovereignfs/dispatch`** | Outbound delivery (email now; SMS/push later) |
| `@sovereignfs/db`     | **`@sovereignfs/database`** | Drizzle client + platform schema + bootstrap  |

`@sovereignfs/sdk`, `@sovereignfs/manifest`, and `@sovereignfs/tsconfig` keep
their functional names — `sdk` is the universally-understood plugin-contract
term, and `manifest`/`tsconfig` are conventional and self-describing.

## Motivation

Sovereign's packages are its building blocks; memorable names give the platform
identity and make the architecture more legible as a product (not just a
dependency graph). The **timing is the point**: there is no CI/publish pipeline
yet (that is the pending Task 0.5.07) and **no public release**, so no package
has reached npm and there are no third-party plugins. Renaming now is **pure
internal churn with zero external breakage**. Once `ui` ships to npm it becomes a
public design-system contract and a rename would be a breaking change under
NFR-04 — so this window closes soon.

`mailer → dispatch` additionally **reframes** the package (see below); `ui →
mosaic` evokes composing a surface from tiles/components; `db → database` is a
cosmetic preference for the full word.

## `mailer` → `dispatch`: a deliberate scope reframe

`dispatch` is renamed _and_ re-conceived as the platform's **unified outbound-
delivery engine**, not an SMTP-only helper. Email is the only channel today;
**SMS, web/native push (APNs/FCM), and webhooks** are intended future channels.

This is coherent with the rest of the plan rather than speculative:

- It layers cleanly beneath the reserved `sdk.notifications` / `sdk.events` SDK
  surfaces and the PWA + native-mobile push direction already documented.
- Every channel stays **optional and no-op when unconfigured**, exactly as SMTP
  is today — preserving NFR-02 (no external dependency for core).
- Plugin-facing surfaces (`sdk.mailer`, and a future `sdk.notifications`) route
  **through** `dispatch`; the codename names the role better than "mailer" would.

**Simplicity caveat (honored):** the name is aspirational, but multi-channel
support is **not built until there is concrete need** ("simplicity over premature
flexibility"). The package's `description` + README state the intended scope so
the codename is never a mystery to a contributor reading email-only code today.

## Reconciling with existing conventions

- **The `@sovereignfs/*` scope is retained.** Only the final path segment
  changes. The single-owned-scope rationale (avoiding dependency-confusion with
  scopes owned by others) is unaffected; the "published vs internal" signal
  remains `"private": true`, not the scope.
- **CLAUDE.md "Package naming and scope"** is updated to reflect the codenames
  and to carry a **codename ↔ function mapping table**, so the names are
  discoverable.
- **"Clarity beats clever" is the real tension.** The project deliberately favors
  descriptive names (e.g. the `--sv-color-text-primary` token rule). We accept
  the codenames for these three only, and mitigate the clarity cost with: an
  accurate `package.json description`, a one-line README per package, and the
  CLAUDE.md mapping table. `sdk`/`manifest`/`tsconfig` stay functional precisely
  to keep the contract surface unambiguous.
- **`mosaic` is the future public contract.** Because `ui` is the design system
  consumed by third-party plugins, the chosen codename becomes the published
  name going forward; `docs/design-system.md` and `docs/plugin-development.md`
  import examples update from `@sovereignfs/ui` to `@sovereignfs/mosaic`.

## Impact when the rename is performed (deferred to a later task)

A single mechanical, repo-wide change. For each of the three packages:

- its `package.json` `name` (and `description`);
- every dependent `package.json` dependency entry;
- all `import` / `from` statements;
- the `transpilePackages` arrays in `runtime/next.config.ts` and
  `apps/auth/next.config.ts`;
- the **ESLint SDK-boundary rule** restricted list — `db` and `mailer` are named
  there (`eslint.config.ts`); after rename it must reference `database` /
  `dispatch`;
- `runtime/src/docs-parity.test.ts` (imports `@sovereignfs/db`) and
  `runtime/src/db.ts` (re-exports);
- docs: the CLAUDE.md naming section, `docs/design-system.md`,
  `docs/plugin-development.md`, `docs/architecture.md`, and any `docs/upgrade.md`
  note.

Representative high-touch areas: **`db` → `database`** (~15 runtime files + the
SDK), **`ui` → `mosaic`** (~12 references incl. both Next configs and the design
docs), **`mailer` → `dispatch`** (~1 source file + the boundary rule + the SDK
mailer surface). `turbo.json` references `@sovereignfs/manifest` (not renamed) and
the pnpm `catalog:` entries are unaffected (`tsconfig` not renamed).

The rename should be **one PR, done in one pass** (a rename split across PRs
leaves the build broken in between), and **must precede first npm publish**.

## Alternatives considered

1. **Codenames in docs only** (keep functional npm names). Zero churn, but the
   maintainer wants real package identity, and the pre-publish window makes the
   actual rename cheap and breakage-free.
2. **Rename all six** (incl. `sdk`/`manifest`/`tsconfig`). Unnecessary and
   counterproductive — `sdk` is the clearest term for the plugin contract;
   `manifest`/`tsconfig` are conventional.
3. **Defer until post-v1.** Would turn the `ui` rename into a breaking npm change
   and a migration burden for plugin authors. Rejected — do it now.
4. **`postman` for the mailer.** Conceptually fine under our scope (no npm
   collision), but `dispatch` better fits the broadened multi-channel role and
   avoids evoking the unrelated API client.

## Open questions

1. **Timing vs Task 0.5.07.** Guarantee the rename lands before the publish
   pipeline / first release.
2. **`dispatch` scope in the SRS.** Whether to add a short note tying `dispatch`
   to the reserved `sdk.notifications` surface so the broadened role is recorded
   beyond this RFC.
3. **`sdk.mailer` evolution.** As channels are added, whether the plugin-facing
   surface stays `sdk.mailer` or is supplemented by `sdk.notifications` — out of
   scope here; flagged for a future RFC.

## Changelog

| Version | Date     | Change                                                                                                               |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; renames ui→mosaic, mailer→dispatch (multi-channel), db→database.                                      |
| —       | Jun 2026 | Withdrawn / deferred; not incorporated. The pre-publish rename window stays open — revisit before first npm publish. |
