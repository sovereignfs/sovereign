# Changelog: @sovereignfs/auth

What changed in each version of the sign-in core and every Sovereign app share, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is
written in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.4.0] - 2026-11-20

### Added

- Who is signed in, typed: `userOf` (`./server`) and `signedInUser` (`./core`) give the SDK's `User`, the same shape for an account of
  the app's own and one from core, with `sub` and the roles core signed only for a session that came through core.

## [0.3.0] - 2026-11-20

### Added

- `@sovereignfs/auth/core`: core as a way in for an app, a better-auth plugin built on the SDK's sign-in, with core's refresh token kept
  by the SDK alone, core's notices verified and remembered, and the plugin's own tables (`coreSignInMigrations`).
- The preset's `localAccounts` switch, the registration's `arrival` (an account from core, or a sign-up of the app's own), and the
  refusal of the password, second-step and passkey routes to an account that has no password.
- The flows behind the second step's setup (`twoFactorSettings`) and the profile (`saveName`).
- Published: the private packages it is built from are bundled in.
- `resolveWaysIn` (the `AUTH_LOCAL` and `AUTH_SIGNUP` defaults of auth.md §5, and an app with no way in refused), `runMigrations` (the
  database package's migrator) and `userIdForSub` (the app's user for core's `sub`).
- `@sovereignfs/auth/postgres`: an app's own PostgreSQL pool as the package's database (`postgresDatabase`), the database package's own
  code, bundled; only this entry loads `pg`.

### Fixed

- A sign-in through core that comes back `login_required` ends only a session that came from core, never a local account's.

## [0.2.0] - 2026-11-19

### Added

- `@sovereignfs/auth/client`: the browser client's plugins and fields, the sign-in value derived from a salt the app names, and the
  flows behind the sign-in pages (`signInWithPassword`, `signInWithPasskey`, `signUp` with `signUpProblem`, `requestPasswordReset`,
  `resetPassword`, `verifySecondStep`, `changePassword`) with their messages.
- `signUpPolicy` and a required `registration`, so no app is open to every sign-up by leaving it out; the server entries throw in a
  browser.

## [0.1.0] - 2026-11-19

### Added

- The part of core's sign-in that is not about core
  ([RFC 0007](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0007-one-sign-in.md)): `createAuthPreset`, better-auth's
  options with every rule a sign-in keeps; the settings resolver; the account and session checks; asking for the password again; a
  person's sessions; the cookie names and the password policy; the session read and page guards with the app's own check between;
  and the account tables with their migrations for apps. Not published yet.
