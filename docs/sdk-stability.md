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

These surfaces are **declared** so the eventual contract is visible, but they are
**not implemented in v1** — every call throws `NotImplementedError`. Their shape
may change before they ship, so a v1 plugin must not depend on them:

- `sdk.data` — consent-gated cross-plugin data sharing (RFC 0002).
- `sdk.activity` — activity log (RFC 0005).
- `sdk.storage`, `sdk.notifications`, `sdk.events` — reserved post-v1 surfaces.

When one of these is implemented, it graduates into the stable surface with a
**minor** release (additive), and this document is updated.

## Distribution

The stable API is the **typed contract**; SDK implementations run inside the
Sovereign runtime. The npm packaging that lets a standalone plugin repo
type-check against the published SDK without pulling in internal packages is
finalised in Task 0.5.20 (RFC 0023). Until that tag ships, consume the SDK from
within the monorepo.
