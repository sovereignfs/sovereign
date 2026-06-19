# SDK stability & semver policy

`@sovereignfs/sdk` is the **only** contract between a plugin and the Sovereign
platform. From **v1.0.0** it is a stable, semver-governed public API: plugin
authors can depend on it without fear of silent breakage. This document defines
what "stable" means and which parts of the surface the guarantee covers.

## Semver policy (NFR-04)

`@sovereignfs/sdk` follows [Semantic Versioning](https://semver.org):

| Bump                | Means                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| **patch** (`1.0.x`) | Bug fixes and internal changes. **No breaking changes, ever.**                         |
| **minor** (`1.x.0`) | **Additive only** — new methods/types/fields. Existing code keeps working.             |
| **major** (`x.0.0`) | Breaking changes, accompanied by a migration guide in [`docs/upgrade.md`](upgrade.md). |

The same discipline applies to `@sovereignfs/ui` (the design system is also a
published plugin contract). Changes are recorded in each package's
`CHANGELOG.md`.

## What the guarantee covers

**Stable surface** — covered by the semver guarantee above:

- `sdk.auth` — session and account (`getSession`, `requireSession`,
  `changePassword`, `listSessions`, `revokeSession`, `signOut`).
- `sdk.db` — the platform Drizzle client (`getClient`).
- `sdk.mailer` — transactional email (`send`).
- `sdk.platform` — instance configuration (`getConfig`).

Plus the exported types (`Session`, `SessionUser`, `ActiveSession`,
`ChangePasswordInput`, `MailOptions`, `PlatformConfig`, `DrizzleClient`, …) and
errors (`NotAuthenticatedError`, `NotImplementedError`, `ConsentRequiredError`).

## What is NOT covered (experimental / reserved)

These surfaces are **experimental** — they are implemented and usable, but their
shape may still change before v1.0.0 stable. Changes follow the same
minor/major bump discipline as stable surfaces, but an additive change
(e.g. a new field on a callback argument) may ship without a minor bump in this
group during the pre-v1 hardening period:

- `sdk.data` — consent-gated cross-plugin data sharing (RFC 0002).
- `sdk.activity` — activity log (RFC 0005).
- `sdk.portability` — user data export/import (RFC 0007, `data:export`/`data:import` permissions).

These surfaces are **reserved** (not yet implemented — every call throws
`NotImplementedError`). Their shape may change before they ship:

- `sdk.storage`, `sdk.notifications`, `sdk.events` — reserved post-v1 surfaces.

When one of these is implemented, it graduates into the stable surface with a
**minor** release (additive), and this document is updated.

## Distribution

`@sovereignfs/sdk` is a **types-first contract** with **zero runtime
dependencies**. Implementations are host-provided by the Sovereign runtime at
startup (`runtime/instrumentation.ts` registers them via `provideHost()`); when
the SDK is called from a composed plugin route, the host's copy always executes,
not the caller's installed copy.

This means:

- A standalone plugin repo can install `@sovereignfs/sdk` as a devDependency
  and type-check against its surface without pulling in platform-internal
  packages (`@sovereignfs/db`, `@sovereignfs/mailer`, etc. — those stay
  `private` and are never bundled into the published SDK).
- The SDK's methods are not meaningful outside the runtime. Calling them from a
  process with no registered host throws `"@sovereignfs/sdk: no runtime host is
registered"`. The dev/test loop is always runtime-hosted.

See `docs/plugin-development.md` → [Plugin isolation boundary](#plugin-isolation-boundary)
for the full authoring ✅ / build ❌ / run ❌ table.

## Published packages summary

Three packages from this monorepo are published to npm:

| Package                      | Purpose                             | Policy                                                                                  |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `@sovereignfs/sdk`           | Plugin↔platform contract (types)    | Strict semver (this document)                                                           |
| `@sovereignfs/ui`            | Design system (components + tokens) | Same strict semver as SDK (NFR-04)                                                      |
| `@sovereignfs/create-plugin` | CLI scaffolding tool                | Semver; CLI tools follow patch/minor/major but have no library compatibility obligation |

`@sovereignfs/create-plugin` is invoked via `npm create @sovereignfs/plugin`.
It is a dev tool, not a runtime library — plugin code never imports it, so
breaking changes follow standard semver without the additional "patch must
never break" constraint that applies to sdk and ui.
