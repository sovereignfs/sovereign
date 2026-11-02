# Environment variables

How Sovereign core and the apps built to run beside it are configured. It is the
convention the shared package [`@sovereignfs/config`](../packages/config) implements;
where the two disagree, this document wins and the package is the bug.

The variables of the core app itself are listed in
[`docs/specs/core-app.md`](../docs/specs/core-app.md) §3.15. This document is the
rules every list follows.

The key words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are used as described in
RFC 2119.

---

## 1. The prefix

Every app has one prefix, and every variable it reads is `<PREFIX>_<NAME>`.

- Core's prefix is **`SV`**. Any other app picks its own (`TASKS`, `NOTES`, …).
- A prefix is upper-case letters and digits and starts with a letter. It is written
  without a trailing underscore: `SV`, not `SV_`.
- A name is upper-case letters, digits and underscores and starts with a letter.
- An app reads only variables with its own prefix. Two apps in one suite therefore
  never read each other's settings, and a suite's shared `.env` can hold both.
- The variables of the platform the app runs on (`NODE_ENV`, `PORT`, `HOSTNAME`,
  `TZ`, proxy settings) are not Sovereign's and are not prefixed.

## 2. Shared names

The same setting has the same name in every app, so an operator learns it once. Only
the prefix differs: `SV_URL` in core, `TASKS_URL` in an app that uses the `TASKS` prefix.

| Name                                               | Meaning                                                                                  | Secret |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| `URL`                                              | The app's public address, with no path. It builds links, cookies and redirects           |        |
| `AUTH_SECRET`                                      | Signs sessions and tokens. At least 32 characters                                        | yes    |
| `CORE_URL`                                         | In an app that runs in a suite: the address of core, the app's sign-in server            |        |
| `CORE_CLIENT_ID`                                   | In an app that runs in a suite: its client ID at core                                    |        |
| `CORE_CLIENT_SECRET`                               | Its client secret at core                                                                | yes    |
| `DB_DIALECT`                                       | Which database: `sqld`, `sqlite` or `postgres`                                           |        |
| `SQLD_URL`                                         | An sqld server's address (when `DB_DIALECT` is `sqld`)                                   |        |
| `SQLD_ADMIN_URL`                                   | Its admin address, used to create namespaces                                             |        |
| `SQLD_NAMESPACE`                                   | The sqld namespace the app uses, so apps can share a server. Default `default`           |        |
| `SQLITE_URL`                                       | A SQLite database file, as a `file:` URL (when `DB_DIALECT` is `sqlite`)                 |        |
| `POSTGRES_URL`                                     | A PostgreSQL address, which can carry a password (when `DB_DIALECT` is `postgres`)       | yes    |
| `POSTGRES_POOL_MAX`                                | Connections in the PostgreSQL pool, at least 2. Default 10                               |        |
| `POSTGRES_DIRECT_URL`                              | The same database on the server itself, never through a pooler (an app, with `database`) | yes    |
| `FIELD_ENCRYPTION_KEYS`                            | The keys that encrypt stored secrets: `id:key` entries, newest first (§3)                | yes    |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` | Outgoing mail                                                                            |        |
| `SMTP_PASSWORD`                                    | Its password                                                                             | yes    |

Database variables name the **engine**, not the component: `SV_POSTGRES_URL`, never
`SV_DB_URL`. `DB_DIALECT` says which engine is in use; nothing infers it from a URL,
and a URL that does not fit the dialect is an error rather than a guess.

An sqld address MAY use any host name, but a request to sqld MUST name its namespace in
the `x-namespace` header, `default` included: with namespaces enabled sqld otherwise
reads the first label of the host as the namespace, and `http://127.0.0.1:8080` becomes
the namespace "127".

## 3. Secrets and the `_FILE` form

A **secret** is any value that grants access or decrypts something: a password, a key,
a token, a signing secret, and an address that carries credentials (a database URL).

- Every secret MAY be given as `NAME`, or as `NAME_FILE`, the path of a file whose
  content is the value. Container secrets arrive as files, and a file keeps the value
  out of `ps`, crash reports and a process's environment.
- Setting both `NAME` and `NAME_FILE` is an **error**. Which one should win is a
  question nobody should have to answer under pressure.
- From a file, **one** trailing newline (LF or CRLF) is dropped, because `echo` and
  container tooling add it. Everything else in the file is the value.
- A secret given directly is used exactly as written, not trimmed.
- A file that cannot be read is an error that names the `_FILE` variable and does not
  repeat the cause.
- **No secret has a default value.** A default secret is one every installation shares.
  A secret is either required or optional, never defaulted.
- The `_FILE` suffix is reserved: no variable's name ends in it.

### Field encryption keys

`FIELD_ENCRYPTION_KEYS` is a key ring: comma-separated `id:key` entries, **newest first**.
An id is 1-32 lower-case letters, digits, `-` or `_`; a key is 32 random bytes in base64 or
base64url (`openssl rand -base64 32`). New values are encrypted with the first entry and any
entry decrypts, so rotating is putting a new entry in front and keeping the old ones until no
stored value names them. The ring is a secret, so it also takes the `_FILE` form. A ring that
is set but malformed is a start-up error even where encryption is optional; each problem names
its entry by position and none shows a key.

## 4. Values

| Type    | Accepted                                                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| string  | Any text. Surrounding whitespace is not part of the value                                                                                                                                                                                                                |
| boolean | Exactly `true` or `false`. Not `1`, `yes`, `on` or `TRUE`: a guess about a setting that may open access is how a deployment goes wrong                                                                                                                                   |
| integer | A whole number in base 10, within the range the variable states                                                                                                                                                                                                          |
| choice  | One of a listed set, spelled exactly                                                                                                                                                                                                                                     |
| list    | Comma-separated; each item is trimmed; an empty item is an error                                                                                                                                                                                                         |
| URL     | Absolute, with a scheme the variable allows (`http` and `https` by default). A trailing slash is dropped. A plain URL MUST NOT contain a username or password: an address with credentials is a secret. An instance's own `URL` is an origin: no path, query or fragment |

An empty or blank value counts as **not set**, so `NAME=` in an `.env` file behaves
like leaving the line out, and a default applies. A variable the app requires and does
not find is an error.

## 5. Start-up validation

An app reads and validates its whole configuration once, when it starts.

- It reports **every** problem at once, not the first, each naming its variable:

  ```text
  Invalid configuration (2 problems):
    - SV_AUTH_SECRET must be at least 32 characters
    - SV_URL is not a valid URL
  ```

- A message **never contains a value**, secret or not. A refused secret is still a
  secret, and a database address can hold a password.
- An invalid configuration stops that app with a non-zero exit. It does not stop any
  other app, and the app does not start in a degraded mode that would open access.
- Required secrets missing, too short or malformed are the cases this exists for: the
  app refuses to start rather than run with a weak secret.

## 6. Settings the Console can change

Some of core's settings can also be changed in the Console (the invite-only switch, the
SMTP settings, the instance name). For those, in order:

1. a value **saved in the Console**, if there is one;
2. otherwise the **environment variable**;
3. otherwise the built-in **default**.

A saved value takes effect without a restart (at once on the instance that saved it, within
a few seconds on others), and clearing it returns the setting to the environment. When the
environment says nothing either, the built-in default applies, and where there is none the
setting is off: a setting left unset never opens access. A saved secret (the SMTP password) is stored encrypted and is never shown
again.

Settings an app needs **before its database is reachable** are environment-only and
cannot be overridden: `URL`, `AUTH_SECRET`, the database variables and
`FIELD_ENCRYPTION_KEYS`. Everything else is an environment default that a saved value may
override.

## 7. Declaring variables

An app declares its variables once, with `@sovereignfs/config`, and reads them nowhere
else. The declaration is the single list: it validates start-up, and `describe()` yields
the rows from which documentation and `.env.example` are written.

```ts
import { boolean, defineConfig, oneOf, secret, url } from '@sovereignfs/config';

const config = defineConfig({
  prefix: 'SV',
  variables: {
    url: url({ name: 'URL', required: true, origin: true }),
    authSecret: secret({ name: 'AUTH_SECRET', required: true, minLength: 32 }),
    inviteOnly: boolean({ name: 'AUTH_INVITE_ONLY', default: false }),
    dialect: oneOf(['sqld', 'sqlite', 'postgres'], { name: 'DB_DIALECT', required: true }),
  },
});

const settings = config.load(); // throws ConfigError, listing every problem
settings.authSecret.reveal(); // a Secret prints as "[redacted]" everywhere else
```

A secret read through the package is a `Secret`: it renders as `[redacted]` in a log,
in JSON and in `util.inspect`, and gives its value only through `reveal()`.
