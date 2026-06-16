# Changelog

All notable changes to `@sovereignfs/sdk` are documented here. The package
follows [Semantic Versioning](https://semver.org); see
[`docs/sdk-stability.md`](../../docs/sdk-stability.md) for the stability policy
and which parts of the surface the guarantee covers.

## 1.0.0

**Stable release.** The v1 SDK surface is now covered by the semver guarantee:
patch = no breaking changes, minor = additive only, major = breaking with a
migration guide.

- **Stable:** `sdk.auth` (`getSession`, `requireSession`, `changePassword`,
  `listSessions`, `revokeSession`, `signOut`), `sdk.db` (`getClient`),
  `sdk.mailer` (`send`), `sdk.platform` (`getConfig`), plus the exported types
  and errors.
- **Experimental / reserved** (declared, throw `NotImplementedError`, not
  covered by the guarantee): `sdk.data` (RFC 0002), `sdk.activity` (RFC 0005),
  `sdk.storage`, `sdk.notifications`, `sdk.events`.
- npm distribution as a dependency-free typed contract is finalised in Task
  0.5.20 (RFC 0023).

### Surface as it grew to 1.0.0 (pre-1.0 history)

- `sdk.auth.signOut()` (0.9.0) — self sign-out (AUTH-02).
- `sdk.db.getClient()` (0.7.0) — live platform Drizzle client.
- `sdk.auth.changePassword`/`listSessions`/`revokeSession` (0.6.0) — Account
  Security.
- `sdk.platform.getConfig()`, `sdk.mailer.send()`, `sdk.auth.getSession()` /
  `requireSession()` — initial implemented surface.
