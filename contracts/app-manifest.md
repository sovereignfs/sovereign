# The app manifest

What an app provides so that it can be hosted on an instance, and what it is given in return. It is the contract between an app
and the operator CLI, so that this repository can host any app and names none. The shape is defined by a JSON Schema for each version,
the latest being [`schemas/app-manifest-v2.schema.json`](schemas/app-manifest-v2.schema.json). This document is manifest **2**; §5.1 says
how manifest 1 differs, and it stays readable for good.

An app is a program of its own. What ties it to an instance is this manifest and the environment it is given (§3), the shared packages it
chooses to use (`@sovereignfs/ui`, `@sovereignfs/sdk`), and, if it declares `signIn`, sign-in through core. Nothing else.

The key words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are used as described in RFC 2119.

An app connected from elsewhere needs no manifest: it is an external app ([`suite.md`](suite.md) §1.7), and
[`docs/connecting-an-app.md`](../docs/connecting-an-app.md) is what it needs.

---

## 1. Where it lives

An app's manifest is the JSON file `sovereign.manifest.json` at the root of its source. That file is the one copy: nothing else in the
app's repository repeats it.

An image built from it carries it as the value of a label:

```text
io.github.sovereignfs.app-manifest
```

made from the file when the image is built, so that it can be read from the registry without pulling the image. The label is the file,
validated and with its white space removed; `@sovereignfs/manifest` makes it (`sovereign-manifest label`, or `docker-args`, which also
passes the port, §3), so that an image cannot carry a manifest the toolkit would refuse. An operator MAY instead give an `https` address
for one, for an image that has no label. When an image has both, the address is used.

## 2. The document

```json
{
  "manifest": 2,
  "prefix": "notes",
  "name": "Notes",
  "description": "Notes for the whole household",
  "port": 3000,
  "health": "/api/health",
  "launch": "/",
  "signIn": {
    "redirect": ["/api/auth/callback/sovereign"],
    "postLogout": ["/"],
    "backChannel": "/api/auth/back-channel-logout",
    "scopes": ["openid", "profile", "email", "offline_access"]
  },
  "database": true,
  "generate": ["NOTES_AUTH_SECRET", { "name": "NOTES_ENCRYPTION_KEY", "bytes": 32 }],
  "data": ["/data"],
  "core": ">=0.50.0 <1.0.0"
}
```

| Field         | Required      | Meaning                                                                                               |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `manifest`    | yes           | This document's format version. `2` here                                                              |
| `prefix`      | yes           | The app's name for itself, in lower case (§2.4). It MUST NOT be `sv`                                  |
| `name`        | yes           | The name people see, on the consent page and the launcher                                             |
| `description` | no            | A short line for the launcher, at most 280 characters                                                 |
| `icon`        | no            | A path on the app, or an `https` address, for its launcher icon. Needs `signIn`                       |
| `port`        | yes           | The one port it listens on, on all interfaces. The app is given it as `PORT` (§3)                     |
| `health`      | yes           | A path that answers `200` once it is ready to take requests                                           |
| `launch`      | no            | The path the launcher sends people to. Default `/`. Needs `signIn`                                    |
| `signIn`      | no            | §2.1. Without it the app signs nobody in through core (§2.3)                                          |
| `database`    | no            | Whether it needs a PostgreSQL database, and how it may be reached (§2.2). Default `false`             |
| `generate`    | no            | Variables, with the app's variable prefix, for which the server generates a random secret once (§2.5) |
| `data`        | no            | Absolute paths in the container to keep across upgrades                                               |
| `storage`     | no            | Manifest 3 only. `true` when the app keeps people's files the suite's way (§2.7). Default `false`     |
| `core`        | with `signIn` | The core versions it works with, as an npm-style semver range (§2.6). Optional without `signIn`       |

A manifest MUST NOT be extended with fields of its own. An unknown field is refused, so that a future field is never ignored. A field that
would have no effect is refused as well: `icon` and `launch` belong to a launcher entry, and an app with no `signIn` has none.

### 2.1 `signIn`

An app that has `signIn` is signed in through core, which makes it a client there (core-app §1.2). An app that has none is not (§2.3).

| Field            | Required | Meaning                                                                                                                                                                                                               |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect`       | yes      | Paths core may send a person back to after sign-in, at least one                                                                                                                                                      |
| `postLogout`     | no       | Paths core may return a person to after sign-out                                                                                                                                                                      |
| `backChannel`    | no       | The path core posts a logout notice to. An app SHOULD have one, or signing out of core leaves it signed in until its tokens stop working                                                                              |
| `accountDeleted` | no       | The path core posts an account-deletion notice to ([core-app §4.5](../docs/specs/core-app.md)). An app that holds anything of a person SHOULD have one, or what it holds stays after the person deletes their account |
| `scopes`         | yes      | What it asks for, from [core-app §3.6.2](../docs/specs/core-app.md). `openid` is required                                                                                                                             |

Every one is a path, which the CLI joins to `https://<name>.<domain>`. An app does not know its own address when it is built, so
a manifest holds no host. A path MUST begin with `/`, and MUST NOT hold `..`, a query or a fragment.

The operator is shown `scopes` when the app is added. A hosted app is registered as trusted, so people are not asked about each
one, and it may ask for `roles`.

### 2.2 `database`

`database` is `true`, `false`, or an object, which means the app has a database and says more about it:

```json
"database": { "pooling": "transaction" }
```

| Field     | Required | Meaning                                                                                                                                                                       |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pooling` | no       | `transaction`: the app works through a transaction pooler. Absent: it needs a session, and is always connected to the database server itself (§3), whatever the instance runs |

An app MAY declare `transaction` only if everything it sends through `<PREFIX>_POSTGRES_URL` is safe when each statement may run on a
different server connection: no session advisory lock, no `SET`, `LISTEN`, temporary table or named prepared statement, and no
transaction left open across a request. What needs a session (its migrations, a lock held across a call) MUST use
`<PREFIX>_POSTGRES_DIRECT_URL`, and MUST hold no more than **2** connections to it at a time, which is what the instance leaves for it. `{}` and `true` mean the same, and an app that declares nothing is never pooled. A toolkit older than
the one that reads `pooling` refuses a manifest that has it, as it does for any field it does not know.

### 2.3 An app with no `signIn`

An app whose people are not the instance's people (a public page, a kiosk) declares no `signIn`. It is then hosted as an app that core knows
nothing of:

- **Core has no client for it.** It is given no `<PREFIX>_CORE_URL`, `<PREFIX>_CORE_CLIENT_ID` or `<PREFIX>_CORE_CLIENT_SECRET` (§3), and
  nothing is registered, so there are no scopes to show the operator.
- **It has no launcher entry**, because in core an app is a client presented through its launcher entry. That is why `icon` and `launch` are
  refused without `signIn`. `sv app list` and `sv app show` still show its `name`.
- **It is hosted in every other way:** its subdomain, certificate, network, `database`, `generate` and `data` are as for any app.

Nothing stops an app from offering sign-in of its own, with or without `signIn`: the people it signs in are its own business.

### 2.4 `prefix`

`prefix` is how the app names itself: lower case, starting with a letter, then letters and digits (`^[a-z][a-z0-9]*$`), and not `sv`. It has
no hyphen because it becomes part of a variable name.

- **Its variable prefix is its upper case:** `notes` gives `NOTES_URL`. `<PREFIX>` in this document is that, and the rules of
  [`env.md`](env.md) §1 are about it.
- **It is the default name in `sv app add`.** The name is still the operator's ([`suite.md`](suite.md) §1.7): when none is given the prefix
  is used, and when the prefix is not a name `suite.md` accepts (too short, too long, or one it reserves) the operator MUST give one. A
  second copy of an app needs a name of its own.

### 2.5 `generate`

Each entry is a variable name, or an object `{ "name": "...", "bytes": N }`. A name begins with the variable prefix and `_`, and appears
once. The server makes `N` random bytes, in URL-safe base64 (`-` and `_`, no padding: what `openssl rand -base64 N` makes with its `+`, `/` and `=` changed), once, and keeps them. `bytes` is from 16 to 64, and a name alone is 48.

---

### 2.7 `storage`

Manifest 3 only. An app with `"storage": true` keeps the files people upload in a folder of the instance's shared volume, through
[`@sovereignfs/storage`](../packages/storage/README.md) ([RFC 0004](../docs/rfcs/0004-file-storage.md)).

- The instance mounts **only the app's own folder**, `s3/<name>` of the volume `sovereign-data`, at `/data/s3/<name>`, made before the
  app starts and owned by the user its image runs as. The app cannot see another app's folder, or core's. The image's `USER` MUST be a
  name or a numeric id, and the app MUST NOT use `/data/s3` or a path inside it for a `data` entry.
- The folder is the app's `STORAGE_PATH` and holds a folder per person, named by their `sub`. A standalone app mounts a volume of its
  own at the same path, so its code does not tell the two apart.
- Backups and restores carry the folder ([operator-cli §10.2](../docs/specs/operator-cli.md)). An app with `driver` other than `fs` keeps
  its files elsewhere and they are not in the backup.
- It MUST delete a person's files when it is told their account was deleted (§4).

---

### 2.6 `core`

A core version is the **platform version**: the tag of `ghcr.io/sovereignfs/sovereign`, the root `package.json` of the Sovereign
repository, and what `suite.yml`'s `core.version` names ([`suite.md`](suite.md) §1.2). It is never `apps/core/package.json`'s own
version, which is internal and releases nothing ([`docs/releasing.md`](../docs/releasing.md)). The CLI checks `core.version`
against this range when an app is added or the instance is upgraded. An app that needs a feature names, as the range's floor, the
first platform release that shipped it.

## 3. What an app is given

A hosted app receives these in its environment, under its `prefix`, using the shared names of [`env.md`](env.md) §2. A name
marked secret is given in its `_FILE` form, so an app MUST read a secret either way, as `env.md` §3 says.

| Variable                       | When            | Secret | Value                                                                                                                                                              |
| ------------------------------ | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                         | Always          |        | The manifest's `port`. The platform's variable, so it has no prefix ([`env.md`](env.md) §1)                                                                        |
| `<PREFIX>_URL`                 | Always          |        | Its public address, `https://<name>.<domain>`                                                                                                                      |
| `<PREFIX>_CORE_URL`            | With `signIn`   |        | Core's address, which is the issuer                                                                                                                                |
| `<PREFIX>_CORE_CLIENT_ID`      | With `signIn`   |        | Its client ID                                                                                                                                                      |
| `<PREFIX>_CORE_CLIENT_SECRET`  | With `signIn`   | yes    | Its client secret                                                                                                                                                  |
| `<PREFIX>_DB_DIALECT`          | With `database` |        | `postgres`                                                                                                                                                         |
| `<PREFIX>_POSTGRES_URL`        | With `database` | yes    | Its own database, as its own role. Through a transaction pooler only when the app declares `pooling` (§2.2) and the instance runs one; otherwise the server itself |
| `<PREFIX>_POSTGRES_DIRECT_URL` | With `database` | yes    | Its own database, as its own role, on the database server itself, never through a pooler. For what needs a session                                                 |
| `<PREFIX>_POSTGRES_POOL_MAX`   | With `database` |        | The most connections its pool may hold                                                                                                                             |
| `<PREFIX>_STORAGE_DRIVER`      | With `storage`  |        | `fs`                                                                                                                                                               |
| `<PREFIX>_STORAGE_PATH`        | With `storage`  |        | `/data/s3/<name>`, the app's own folder of the shared volume (§2.7)                                                                                                |
| `<PREFIX>_STORAGE_QUOTA_MB`    | With `storage`  |        | What each person may keep: `204800` (200 GB) unless the operator sets it under the app's `env`                                                                     |
| `<PREFIX>_STORAGE_FILE_QUOTA`  | With `storage`  |        | How many files each person may keep: `1000` unless the operator sets it under the app's `env`                                                                      |
| `<PREFIX>_STORAGE_SIGNING_KEY` | With `storage`  | yes    | Made by the instance: 48 random bytes, in URL-safe base64, once                                                                                                    |
| What `generate` names          | When listed     | yes    | Random bytes, in URL-safe base64, made once and kept: 48, or the entry's `bytes` (§2.5)                                                                            |

Anything else comes from the operator: `env` in `suite.yml`, or `secrets.age.yml`. Neither may set a variable in this table, except the two quotas.

---

## 4. What an app must do

- It MUST run from one image, as a process that does not need to be root, configured only by its environment.
- It MUST listen on `PORT`, on all interfaces: the proxy and the health check use the manifest's `port`, and `PORT` is what the app is
  given. An image that builds the port in (`ARG PORT`, from `sovereign-manifest docker-args`) never writes the number itself.
- It MUST NOT publish a port, and MUST expect TLS to end at the proxy. It MUST take its public address from `<PREFIX>_URL`, not
  from the request.
- It MUST apply its own database migrations when it starts, and MUST be safe to start again after they have run.
- It MUST NOT need an admin credential for its database, or any object outside it.
- An app that declares `signIn` MUST accept sign-in through core, with PKCE, as [`docs/connecting-an-app.md`](../docs/connecting-an-app.md)
  describes, and MUST NOT need core's session cookie. It MAY offer other ways in as well. An app that declares none MUST NOT read core's
  variables, which it is not given.
- An app that declares `backChannel` or `accountDeleted` MUST verify core's notice as [`sdk.md`](../docs/specs/sdk.md) §9.1 describes, whatever
  keeps its sessions, and for `accountDeleted` MUST answer `200` only after it has deleted what it holds of the person.
- It MUST keep what must survive an upgrade only in its database or under `data`. Each `data` path MUST exist in the image and be writable
  by the user the app runs as, because Docker makes a new volume from the image's folder at that path and owns it as root otherwise.
- It MUST stop cleanly on `SIGTERM`.
- An app with `signIn` MUST read core's address from `<PREFIX>_CORE_URL` and not assume one.
- An app with `signIn` SHOULD run as the instance needs with only what this section gives it and what its manifest generates.
  In particular, when core is its only way in, it SHOULD give an account to anyone core signs in without being told to: core already
  decides who may sign in, and an app that admits only the first person would make every operator set something to undo it. An app
  that offers ways in of its own (a password, say) keeps those closed unless its operator opens them.

---

## 5. Changing the format

`manifest` is a whole number. A change that a current toolkit could misread raises it. A toolkit refuses a version it does not
read, and names the version that does. Each version keeps its JSON Schema under `schemas/`, forever, and a toolkit reads every
version it has ever supported, since old images stay published. `@sovereignfs/manifest` holds every schema and says what any version
means in the latest one's terms.

### 5.1 Manifest 1

Manifest 1 is [`schemas/app-manifest-v1.schema.json`](schemas/app-manifest-v1.schema.json). It is manifest 2 with these differences, and
nothing else:

| Field      | Manifest 1                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `prefix`   | Upper case, `^[A-Z][A-Z0-9]*$`, and not `SV`. It is the variable prefix as written. It is not a default name: `sv app add` needs one |
| `signIn`   | Required, so an app is always a client at core, with a launcher entry                                                                |
| `core`     | Required                                                                                                                             |
| `generate` | Variable names only, each 48 bytes                                                                                                   |

Everything an app is given (§3, including `PORT`) and everything it must do (§4) is the same for both versions.

### 5.2 Manifest 3

Manifest 3 is [`schemas/app-manifest-v3.schema.json`](schemas/app-manifest-v3.schema.json). It is manifest 2 and one more field, `storage`
(§2.7), and nothing else. A toolkit that reads 3 reads 1 and 2 as it did, and a toolkit that reads only 1 and 2 refuses a manifest 3 and
names the version that reads it.
