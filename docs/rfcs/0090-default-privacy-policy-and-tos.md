# RFC 0090 — Default privacy policy and terms of service, platform and plugin

**Status:** Draft\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** repo root (`PRIVACY.md`, `TOS.md`), `runtime` (`/privacy`, `/tos`, middleware), `docs/legal/`,
`docs/self-hosting.md`, `docs/plugin-development.md`, `scripts/generate-registry.ts`, `packages/manifest`,
`registry/`; a companion follow-up (not designed here) in the separate `sovereign-infra` repo.\
**Incorporated into plan:** No — documentation-first.

---

## Summary

Every Sovereign instance serves `/privacy` and `/tos` from day one, no
operator action required, rendered from plain root-level `PRIVACY.md` and
`TOS.md` files shipped with the platform. An operator who wants their own
name and contact on the page replaces those two files — in their fork, or
via a mount in their `sovereign-infra` deployment — with a filled-in copy of
a template kept in `docs/legal/`. The only difference between the shipped
default and the operator's copy is the operator's name and contact; nothing
else changes. The same pattern repeats one level down: every plugin ships
its own root-level `PRIVACY.md`/`TOS.md`, auto-served at
`<routePrefix>/privacy` and `<routePrefix>/tos` by the same build step that
already composes every other plugin route, and a plugin can't be published
to the registry without them.

## Motivation

[Research 0007](../research/0007-operator-compliance-surface.md) found
`instance_config` carries branding but nothing legal, and rejected shipping
project-authored policy text that makes claims about a specific operator's
identity or jurisdiction nobody confirmed ("Option C" — see that doc). This
RFC doesn't do that: the root `PRIVACY.md`/`TOS.md` state only what's true
of the Sovereign platform software itself, for any instance, unconditionally
— no operator name, no jurisdiction, no guessed fact. An operator who wants
to add their own identity does so explicitly, by replacing the file with
their own copy. Nothing is asserted on an operator's behalf without them
having written it.

Plugins are the same problem one level down and were previously
undocumented: a plugin can request device capabilities, send mail, or
process data the platform has no visibility into, and there has been no
place — for an admin reviewing it before install, or a user of it — to find
out what it does with data.

## Current state (what this builds on)

- No `PRIVACY.md`/`TOS.md` exists at the repo root today.
- `runtime/app/privacy/page.tsx` and `runtime/app/terms/page.tsx` (built
  earlier this session) are static, hand-written pages with `[BRACKETED]`
  operator-identity placeholders rendered verbatim — superseded by this RFC.
  `runtime/middleware.ts:602` already excludes both routes from the auth
  gate; the exclusion is reused, only content sourcing changes (and `/terms`
  renames to `/tos`).
- `docs/legal/operator-template-privacy.md` and `-terms.md` (also built
  this session) are far more heavily parameterized than needed — placeholders
  for jurisdiction, SMTP provider, retention policy, children's policy,
  acceptable-use specifics. This RFC trims them down to match the root
  default plus only a name/contact field, per the simpler design below.
- `scripts/generate-registry.ts`'s `composePlugins()` (`:455-491`) already
  copies (dev: incremental `syncDir`; prod: `symlinkSync`) each plugin's
  `app/` tree into its routed destination — `composeTargets(manifest)`
  resolves the destination(s) from the manifest's `routePrefix`. This runs
  for every plugin, every `pnpm generate`/`pnpm dev`/build, and is the
  existing mechanism this RFC extends — not new infrastructure. Each
  plugin's own directory (`plugins/<dir>/`, or the equivalent for an
  externally-hosted registry plugin) is a sibling of its `app/` folder, so a
  root-level `PRIVACY.md`/`TOS.md` there is visible to this same step.
- `packages/manifest/src/validate.ts` has `validateManifest(input: unknown)`
  and `validateRegistryEntry(input: unknown)` (`:20`, `:37`) — both pure
  functions over the manifest/registry-entry JSON, no filesystem access.
  They cannot check for a sibling file's existence directly; the actual
  enforcement points with filesystem access are `composePlugins()` itself
  (build time, every install) and `scripts/generate-registry.ts`'s
  registry-submission validation path (`registry:validate`/`registry:check`
  — already the human-reviewed gate for the public registry).
- No markdown-rendering dependency exists anywhere in the repo today (no
  `react-markdown`, `remark`, `marked`, or `markdown-to-jsx` in any
  `package.json`). This RFC needs one, added once to `runtime`.

## Proposed design

### Platform default: root `PRIVACY.md` / `TOS.md`

Two new files at the repo root, sibling to `LICENSE` and `README.md`.
Content: what the platform software does, unconditionally true for any
instance — account fields collected at registration, cookies, PWA caching
behavior, how outbound email works, where data is stored, how push works,
data export/deletion. No operator name, no jurisdiction, no guessed fact.
This is a rewrite of the useful parts of `docs/legal/operator-template-
privacy.md`/`-terms.md` as already researched this session, with every
operator-identity placeholder removed rather than left as a bracket.

`runtime/app/privacy/page.tsx` and the renamed `runtime/app/tos/page.tsx`
read and render these two files directly (markdown → React, via a small
shared renderer added to `runtime`) — a plain file read, no database, no
computed facts, no redirect logic. `LegalLinks` (`packages/ui`), the
middleware exclusion (`runtime/middleware.ts:602`, `terms` → `tos`), and the
Account plugin footer link (`plugins/account/app/layout.tsx`) are otherwise
unaffected.

### Operator override: replace the file

An operator who wants their name and contact on the page copies
`docs/legal/operator-template-privacy.md`/`-terms.md` — the same content as
the root default, plus an "operated by [Name], contact [Email]" line — fills
in the two blanks, and replaces `PRIVACY.md`/`TOS.md` with it:

- **Fork-and-track operators:** edit the file directly in their fork and
  commit it, the same file the platform ships (not a separate `operator/`
  path — the point is that only the two identity fields differ, so there's
  nothing else to keep merge-conflict-isolated the way `operator/OPERATOR.md`
  needs to be).
- **`sovereign-infra`-deployed operators:** mount their filled-in copy over
  the shipped file's path in their `docker-compose.override.yml`
  (`operator/docker-compose.override.yml` is already a documented optional
  file per RFC 0028) — a one-line volume mount, no runtime code change.
  `sovereign-infra` is a separate repo; this RFC only notes the integration
  point and that its own deployment template should carry a copy of the
  operator template as a starting point — a companion change there, not part
  of this monorepo's adoption path.

`docs/self-hosting.md` gets a short section under both the fork-and-track
and Docker-only setup tracks pointing at this template and the two-field
difference, so an operator finds it without reading this RFC.

### Plugin default: root `PRIVACY.md` / `TOS.md` per plugin, auto-served

Every plugin — first-party (`plugins/*`), example (`example-plugins/*`), or
external (registry, `.local`) — ships its own `PRIVACY.md`/`TOS.md` at the
root of its own directory, sibling to `manifest.json` and `app/` (not inside
`app/`, so it isn't confused with the plugin's own page routes).

`composePlugins()` (`scripts/generate-registry.ts:455`) gains one small
addition to its existing per-plugin loop: for each `dest` in
`composeTargets(manifest)`, after `linkOrCopyTarget` composes the plugin's
`app/` tree as it already does, write two small generated page files —
`dest/privacy/page.tsx` and `dest/tos/page.tsx` — that import and render
that plugin's root `PRIVACY.md`/`TOS.md` through the same shared markdown
renderer the platform-level pages use. This makes `<routePrefix>/privacy`
and `<routePrefix>/tos` real, auto-served routes for every composed plugin,
with no plugin-author code beyond the two markdown files. If a plugin is
missing one (only possible for a `.local`/unregistered plugin — see
Enforcement), the generated route renders a plain "this app has not
published this page" state rather than a broken link.

`docs/legal/plugin-template-privacy.md` and `plugin-template-terms.md` (new)
give plugin authors a starting draft — same shape as the operator template,
scoped to what a typical plugin might collect (its own tables, any external
API calls it makes, any device capability it requests) — copied into a new
plugin's root and edited to match what that specific plugin actually does.
`packages/create-plugin`'s scaffolder and `sovereign-plugin-template` should
include these two files pre-populated from the template so a newly scaffolded
plugin has them from the start rather than needing to remember to add them.

### Enforcement

Split by where filesystem access actually exists (see Current state — pure
manifest validation can't check for a sibling file):

- **`composePlugins()`, every build:** a plugin missing `PRIVACY.md` or
  `TOS.md` at its root logs a clear warning (not a hard failure — would
  otherwise break every existing local/`.local` dev plugin the moment this
  ships) naming the plugin and the missing file.
- **`registry:validate`/`registry:check`, registry submission:** hard
  requirement. A plugin can't be added to `registry/plugins.json` without
  both files present in its repo at the declared ref — this is the one
  point that already does human review, so it's the right place for a real
  gate rather than a warning.

`docs/plugin-development.md` gets a new "Privacy and Terms of Service"
section next to the manifest reference: what the two files are, where they
live, the auto-served routes, a link to the two templates, and the
registry-submission requirement.

## Alternatives considered

**A database-backed, per-instance config surface with Console-editable
identity fields, redirects, and computed-fact interpolation** (this RFC's
own previous draft). Replaced — real overkill for what's actually needed. A
flat file the operator replaces achieves the same outcome (an operator's
name showing up on the page) with no schema migration, no settings form, no
redirect logic, and no build-time interpolation engine to maintain.

**Generic runtime-synthesized `<routePrefix>/privacy` route driven by a
manifest field (`privacyUrl`) instead of a convention-based file.**
Rejected — a fixed file-at-plugin-root convention needs no new manifest
field, no URL validation, and no distinction between "a page under the
plugin's own `app/` tree" and "an external link"; every plugin gets the
exact same predictable route with zero configuration.

**Auto-serve operator-identity placeholder text with no operator action**
(this session's first approach — `[Operator Name]` brackets rendered
verbatim). Rejected — asserts something about a specific operator nobody
confirmed. Distinct from the chosen design, which asserts nothing beyond
what's true of the platform software itself until an operator explicitly
replaces the file.

## Open questions

1. Exact markdown-rendering dependency for `runtime` (`react-markdown` vs.
   `markdown-to-jsx` vs. hand-rolled) — an implementation detail, needs a
   `pnpm-workspace.yaml` catalog entry once chosen.
2. Whether the `composePlugins()` warning (missing files, non-registry
   plugins) should eventually become a hard failure once the ecosystem has
   had time to adopt this — not decided now; revisit once registry adoption
   data exists.
3. Exact starting content for `docs/legal/plugin-template-privacy.md`/
   `-terms.md` — needs a pass similar to the one already done for the
   operator template's account/cookie/PWA/email/push inventory, scoped to
   what's generically true of _any_ plugin (its own DB tables under the
   platform's data model) versus what's plugin-specific and has to stay a
   blank.

## Adoption path

Documentation-first; no scheduling commitment yet. When scheduled:

1. Write root `PRIVACY.md`/`TOS.md`.
2. Rewrite `docs/legal/operator-template-privacy.md`/`-terms.md` down to
   "root default plus name/contact" per the simplified design.
3. Add the markdown-rendering dependency to `runtime`; rework
   `runtime/app/privacy/page.tsx` and rename `runtime/app/terms/` →
   `runtime/app/tos/` (update `runtime/middleware.ts:602`'s matcher and
   every `LegalLinks` `termsHref` usage this session added) to read the root
   files.
4. Write `docs/legal/plugin-template-privacy.md`/`plugin-template-terms.md`.
5. Add `PRIVACY.md`/`TOS.md` to every first-party plugin (`plugins/console`,
   `plugins/launcher`, `plugins/account`, `plugins/tasks`) and
   `example-plugins/*` so nothing breaks when enforcement ships.
6. Extend `composePlugins()` to generate `privacy/page.tsx`/`tos/page.tsx`
   per composed plugin route, plus the missing-file warning.
7. `docs/plugin-development.md`'s new section; `packages/create-plugin`
   scaffolder update.
8. `registry:validate`/`registry:check` hard requirement.
9. `docs/self-hosting.md` sections for both operator tracks.
10. Companion follow-up (separate repo, tracked here for visibility only):
    `sovereign-infra` gets the operator template pre-populated in its own
    deployment scaffold.

No published-package semver impact beyond a routine `@sovereignfs/create-
plugin` scaffolder update and a minor `@sovereignfs/ui` `LegalLinks` prop
rename (`termsHref` usages) on the `/tos` rename.

## Changelog

| Version | Date        | Change                                                                                                                                                           |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft                                                                                                                                                    |
| 0.2     | August 2026 | Simplified: flat-file default + override, per-plugin auto-served routes via existing `composePlugins()`, dropped `instance_config`/Console/computed-facts design |
