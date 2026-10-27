# @sovereignfs/config

The environment variable convention for Sovereign core and the apps that run beside
it: declare your settings once, read them in one place, and fail at start-up, naming
the variable, when one is wrong. The convention itself is
[`spec/env.md`](../../spec/env.md); this package implements it.

> Not yet published to npm. It is `private` until the first app outside this
> repository needs it.

```ts
import { boolean, defineConfig, oneOf, secret, url } from '@sovereignfs/config';

const config = defineConfig({
  prefix: 'SV', // every variable is SV_<NAME>; an app picks its own prefix
  variables: {
    url: url({ name: 'URL', required: true, origin: true }),
    authSecret: secret({ name: 'AUTH_SECRET', required: true, minLength: 32 }),
    inviteOnly: boolean({ name: 'AUTH_INVITE_ONLY', default: false }),
    dialect: oneOf(['sqld', 'sqlite', 'postgres'], { name: 'DB_DIALECT', required: true }),
  },
});

const settings = config.load(); // typed; throws a ConfigError listing every problem
settings.url; // string
settings.inviteOnly; // boolean
settings.authSecret.reveal(); // the value; a Secret prints as [redacted] everywhere else
```

## What it guarantees

- **Every problem at once, each naming its variable, none showing a value.** A refused
  secret is still a secret, and a database address can hold a password.
- **Secrets cannot leak by accident.** A secret is a `Secret`: it renders as
  `[redacted]` in a log, in JSON and in `util.inspect`, and gives its value only
  through `reveal()`.
- **`NAME_FILE` for every secret.** Setting both `NAME` and `NAME_FILE` is an error; one
  trailing newline is dropped from a file; an unreadable file is reported without its
  cause.
- **No secret has a default.** `secret()` has no `default` option, and the types forbid
  passing one.
- **Blank is unset.** `NAME=` behaves like leaving the line out.
- **Exact types.** Booleans are `true` or `false` and nothing else; integers are whole
  numbers in a range; choices are spelled exactly; lists reject empty items; URLs are
  absolute with an allowed scheme, and a plain URL cannot carry credentials.
- **No dependencies,** and no static import of `node:fs`, so it bundles for any runtime;
  a file is read only when a `_FILE` variable is set.

`config.describe()` returns one row per variable (name, `_FILE` form, type, whether it
is required or secret, default, choices) for writing documentation or an `.env.example`.

## Scripts

```bash
pnpm --filter @sovereignfs/config build       # emits dist/
pnpm --filter @sovereignfs/config typecheck
pnpm test                                     # the tests run with the repository's unit suite
```
