# @sovereignfs/auth

How core and every Sovereign app sign people in: core's own sign-in, the part of it that is not about core, so an app keeps the same
rules without copying them. What it does is [`docs/specs/auth.md`](../../docs/specs/auth.md); why, [RFC 0007](../../docs/rfcs/0007-one-sign-in.md).

Not published yet: it is built from private packages of this repository, and is published once an app can sign in with it on its own.

## Entries

- `@sovereignfs/auth`: what runs anywhere (the cookie names, the password policy, the time zone and language checks, `safeReturnTo`).
- `@sovereignfs/auth/server`: `createAuthPreset`, the settings resolver, the session read, the checks, a person's sessions, the
  account tables and their migrations.
- `@sovereignfs/auth/client`: the sign-in in a page: the browser client's plugins (`signInClientPlugins`), the sign-in value
  (`signInDerivation`), and the flows behind the design system's forms (`signInWithPassword`, `signUp`, `resetPassword`, …).
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

## Licence

MPL-2.0.
