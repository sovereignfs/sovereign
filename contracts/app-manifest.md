# The app manifest

What an app provides so that it can be hosted on an instance, and what it is given in return. It is the contract between an app
and the operator CLI, so that this repository can host any app and names none. The shape is defined by a JSON Schema,
[`schemas/app-manifest-v1.schema.json`](schemas/app-manifest-v1.schema.json).

The key words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are used as described in RFC 2119.

An app connected from elsewhere needs no manifest: it is an external app ([`suite.md`](suite.md) §1.7), and
[`docs/connecting-an-app.md`](../docs/connecting-an-app.md) is what it needs.

---

## 1. Where it lives

A manifest is a JSON document, carried as the value of a label on the app's image:

```text
io.github.sovereignfs.app-manifest
```

so that it can be read from the registry without pulling the image. An operator MAY instead give an `https` address for one, for
an image that has no label. When an image has both, the address is used.

## 2. The document

```json
{
  "manifest": 1,
  "prefix": "NOTES",
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
  "generate": ["NOTES_AUTH_SECRET"],
  "data": ["/data"],
  "core": ">=0.50.0 <1.0.0"
}
```

| Field         | Required | Meaning                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------- |
| `manifest`    | yes      | This document's format version. `1` here                                                  |
| `prefix`      | yes      | The app's variable prefix ([`env.md`](env.md) §1). It MUST NOT be `SV`                    |
| `name`        | yes      | The name people see, on the consent page and the launcher                                 |
| `description` | no       | A short line for the launcher, at most 280 characters                                     |
| `icon`        | no       | A path on the app, or an `https` address, for its launcher icon                           |
| `port`        | yes      | The one port it listens on, on all interfaces                                             |
| `health`      | yes      | A path that answers `200` once it is ready to take requests                               |
| `launch`      | no       | The path the launcher sends people to. Default `/`                                        |
| `signIn`      | yes      | §2.1                                                                                      |
| `database`    | no       | Whether it needs a PostgreSQL database, and how it may be reached (§2.2). Default `false` |
| `generate`    | no       | Variables, with the app's prefix, for which the server generates a random secret once     |
| `data`        | no       | Absolute paths in the container to keep across upgrades                                   |
| `core`        | yes      | The core versions it works with, as an npm-style semver range                             |

A manifest MUST NOT be extended with fields of its own. An unknown field is refused, so that a future field is never ignored.

### 2.1 `signIn`

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

---

## 3. What an app is given

A hosted app receives these in its environment, under its `prefix`, using the shared names of [`env.md`](env.md) §2. A name
marked secret is given in its `_FILE` form, so an app MUST read a secret either way, as `env.md` §3 says.

| Variable                       | When            | Secret | Value                                                                                                                                                              |
| ------------------------------ | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<PREFIX>_URL`                 | Always          |        | Its public address, `https://<name>.<domain>`                                                                                                                      |
| `<PREFIX>_CORE_URL`            | Always          |        | Core's address, which is the issuer                                                                                                                                |
| `<PREFIX>_CORE_CLIENT_ID`      | Always          |        | Its client ID                                                                                                                                                      |
| `<PREFIX>_CORE_CLIENT_SECRET`  | Always          | yes    | Its client secret                                                                                                                                                  |
| `<PREFIX>_DB_DIALECT`          | With `database` |        | `postgres`                                                                                                                                                         |
| `<PREFIX>_POSTGRES_URL`        | With `database` | yes    | Its own database, as its own role. Through a transaction pooler only when the app declares `pooling` (§2.2) and the instance runs one; otherwise the server itself |
| `<PREFIX>_POSTGRES_DIRECT_URL` | With `database` | yes    | Its own database, as its own role, on the database server itself, never through a pooler. For what needs a session                                                 |
| `<PREFIX>_POSTGRES_POOL_MAX`   | With `database` |        | The most connections its pool may hold                                                                                                                             |
| What `generate` names          | When listed     | yes    | 48 random bytes, in base64, made once and kept                                                                                                                     |

Anything else comes from the operator: `env` in `suite.yml`, or `secrets.age.yml`. Neither may set a variable in this table.

---

## 4. What an app must do

- It MUST run from one image, as a process that does not need to be root, configured only by its environment.
- It MUST NOT publish a port, and MUST expect TLS to end at the proxy. It MUST take its public address from `<PREFIX>_URL`, not
  from the request.
- It MUST apply its own database migrations when it starts, and MUST be safe to start again after they have run.
- It MUST NOT need an admin credential for its database, or any object outside it.
- It MUST sign people in through core, with PKCE, as [`docs/connecting-an-app.md`](../docs/connecting-an-app.md) describes. It
  MUST NOT need core's session cookie.
- It MUST keep what must survive an upgrade only in its database or under `data`. Each `data` path MUST exist in the image and be writable
  by the user the app runs as, because Docker makes a new volume from the image's folder at that path and owns it as root otherwise.
- It MUST stop cleanly on `SIGTERM`.
- It MUST read core's address from `<PREFIX>_CORE_URL` and not assume one.

---

## 5. Changing the format

`manifest` is a whole number. A change that a current toolkit could misread raises it. A toolkit refuses a version it does not
read, and names the version that does. Each version keeps its JSON Schema under `schemas/`, forever, and a toolkit reads every
version it has ever supported, since old images stay published.
