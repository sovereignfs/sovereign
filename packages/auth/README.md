# @sovereignfs/auth

How core and every Sovereign app sign people in: core's own sign-in, the part of it that is not about core, so an app keeps the same
rules without copying them. What it does is [`docs/specs/auth.md`](../../docs/specs/auth.md); why, [RFC 0007](../../docs/rfcs/0007-one-sign-in.md).

## Entries

- `@sovereignfs/auth`: what runs anywhere (the cookie names, the password policy, the time zone and language checks, `safeReturnTo`).
- `@sovereignfs/auth/server`: `createAuthPreset`, the settings resolver, the session read, the checks, a person's sessions, the
  account tables and their migrations.
- `@sovereignfs/auth/client`: the sign-in in a page: the browser client's plugins (`signInClientPlugins`), the sign-in value
  (`signInDerivation`), and the flows behind the design system's forms (`signInWithPassword`, `signUp`, `resetPassword`, …).
- `@sovereignfs/auth/core`: core as a way in (`sovereignSignIn`, `coreNotices`, `coreSignOutUrl`, `needsCoreCheck`).
- `@sovereignfs/auth/next`: the page guards.

## Using it

```ts
import { betterAuth } from 'better-auth';
import { accountTables, createAuthPreset, signUpPolicy } from '@sovereignfs/auth/server';

export const auth = betterAuth(
  createAuthPreset({
    appName: 'Notes',
    database,
    tables: accountTables(database.family),
    settings,
    mail,
    registration: signUpPolicy(database, 'closed'),
  }),
);
```

Run `accountMigrations(database.family)` at start-up under `ACCOUNT_MIGRATIONS_TABLE`, apart from the app's own.

### An app that had a sign-in of its own

An app that kept better-auth's tables before the package (`user`, `session`…) moves onto it once
([auth.md §8.1](https://github.com/sovereignfs/sovereign/blob/main/docs/specs/auth.md)):

- `adoptAccountTables(database, { core })` at start-up, before the migrations: it renames the tables, adds what the package has, and
  marks every password for 90 days. One-way.
- `movePasswords({ database })` among the preset's `plugins`, `passwordsMoving(database)` as `moving` in the app's salt document, and
  `passwordMove({ saltDocument, previous })` passed to `signInWithPassword` on the sign-in page: a person's password is moved at their
  next sign-in. `previous` is what the page sent before the package, the password unless the app derived a value of its own.
- `resetLink(auth, email, baseUrl)` from a command of the app's, for whoever does not come back within the 90 days.
- `coreSubOf(database, userId)` (`./core`) for the `sub` core knows a person by; keep no copy.

## Licence

MPL-2.0.
