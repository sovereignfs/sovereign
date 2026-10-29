# The instance repository

The exact shape of the files in an operator's instance repository. It is the convention the operator CLI implements; where the
two disagree, this document wins and the CLI is the bug. What the CLI does with them is in
[`docs/specs/operator-cli.md`](../docs/specs/operator-cli.md).

The key words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are used as described in RFC 2119.

`suite.yml` and `suite.lock` are defined by JSON Schemas ([`schemas/suite-v1.schema.json`](schemas/suite-v1.schema.json) and
[`schemas/suite-lock-v1.schema.json`](schemas/suite-lock-v1.schema.json)). The rules below that a schema cannot express are
checked by the CLI.

---

## 1. `suite.yml`

What the operator chose, and only that. It is YAML, written by `sv` and safe to edit by hand.

```yaml
schema: 1
domain: sovereign.fs
core:
  version: 0.49.0
  env:
    SV_SMTP_HOST: smtp.example.com
    SV_SMTP_PORT: '587'
database:
  version: '18'
server:
  host: 203.0.113.7
  deploy: ssh
tls:
  mode: per-host
  email: operator@example.com
secrets:
  recipients:
    - age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj
    - age1lggyhqrw2nlhcxprm67z43rta597azn8gknawjehu9d9dl0jq3yqqvfafg
apps:
  notes:
    image: ghcr.io/example/notes:1.2.0
    env:
      NOTES_DEFAULT_LOCALE: en
  wiki:
    external: true
    name: Team wiki
    redirect:
      - https://wiki.example.com/auth/callback
    scopes:
      - openid
      - profile
      - email
```

### 1.1 Top level

| Field      | Required | Meaning                                                                                                                             |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `schema`   | yes      | This file's format version. `1` here (§4)                                                                                           |
| `domain`   | yes      | Core's host, with no scheme. Core is `https://<domain>`, and a hosted app `https://<name>.<domain>`                                 |
| `core`     | yes      | §1.2                                                                                                                                |
| `database` | yes      | §1.3                                                                                                                                |
| `server`   | yes      | §1.4                                                                                                                                |
| `tls`      | no       | §1.5. Default `mode: per-host`                                                                                                      |
| `secrets`  | yes      | §1.6                                                                                                                                |
| `apps`     | no       | §1.7. An instance with none is complete                                                                                             |
| `purge`    | no       | Names of removed apps whose data the next deployment deletes. Written by `sv app remove --purge`, and no name may also be in `apps` |

### 1.2 `core`

| Field     | Required | Meaning                                                                                            |
| --------- | -------- | -------------------------------------------------------------------------------------------------- |
| `version` | yes      | Core's version, `X.Y.Z`. The image's tag is this                                                   |
| `env`     | no       | Other settings for core, as in `apps/core/.env.example`. Names begin `SV_`, and values are strings |

`core.env` MUST NOT hold a variable the deployment provides or refuses:

`SV_URL`, `SV_AUTH_SECRET`, `SV_FIELD_ENCRYPTION_KEYS`, `SV_DB_DIALECT`, `SV_POSTGRES_URL`, `SV_SQLD_URL`,
`SV_SQLD_ADMIN_URL`, `SV_SQLD_NAMESPACE`, `SV_SQLITE_URL`, `SV_AUTH_COOKIE_DOMAIN`, `SV_AUTH_WEBAUTHN_RP_ID`, or any of these
with `_FILE`.

A secret MUST NOT be in `env`. A name ending in `_PASSWORD`, `_SECRET`, `_KEY`, `_KEYS` or `_TOKEN` is refused, and belongs in
`secrets.age.yml` (§3).

### 1.3 `database`

| Field     | Required | Meaning                                                                         |
| --------- | -------- | ------------------------------------------------------------------------------- |
| `version` | yes      | PostgreSQL's major version, as a string. It cannot change on a running instance |

PostgreSQL is the only engine in this version, so there is no field for it.

### 1.4 `server`

| Field    | Required | Meaning                                               |
| -------- | -------- | ----------------------------------------------------- |
| `host`   | yes      | A host name or an IP address                          |
| `port`   | no       | Its SSH port. Default `22`                            |
| `user`   | no       | The SSH user. Default `sovereign`                     |
| `deploy` | no       | `ssh` (the default) or `github`: how `sv deploy` goes |

### 1.5 `tls`

| Field   | Required | Meaning                                                                                                                                                   |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`  | no       | `per-host`: a public certificate per name, by HTTP challenge. `internal`: certificates from the server's own authority, for a machine with no public port |
| `email` | no       | The address the certificate authority may write to, in `per-host`                                                                                         |

With `internal`, a device must be told to trust the server's authority, or a browser warns on every page, and installing core
as an app and passkeys will not work until it does.

### 1.6 `secrets`

| Field        | Required | Meaning                                                                                                                                    |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `recipients` | yes      | The age public keys every secret is encrypted to, at least one, none twice. The operator's, and the server's once it has been bootstrapped |

### 1.7 `apps`

A map from an app's name to what it is. A name:

- is a DNS label: lower-case letters, digits and hyphens, 2 to 32 characters, starting with a letter and ending with a letter
  or digit;
- is a hosted app's subdomain, and core's managed key for the app in either case, so changing it makes a different app;
- MUST NOT be `core`, `proxy`, `database`, `www`, `api` or `auth`.

A **hosted app**:

| Field      | Required | Meaning                                                                                                                                                                                             |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`    | yes      | The image, with a tag or digest. Never `latest`, and never with no tag                                                                                                                              |
| `manifest` | no       | An `https` address of its manifest, for an image with no label                                                                                                                                      |
| `env`      | no       | Other settings for the app. Names begin with the manifest's prefix, and values are strings. Holds to §1.2's rule on secrets, and MUST NOT set what [`app-manifest.md`](app-manifest.md) §3 provides |
| `launcher` | no       | Changes to its launcher entry (below)                                                                                                                                                               |

A hosted app's trust, addresses and scopes are not here: they come from the manifest and its name.

An **external app**:

| Field         | Required | Meaning                                                               |
| ------------- | -------- | --------------------------------------------------------------------- |
| `external`    | yes      | `true`                                                                |
| `name`        | yes      | The name people see                                                   |
| `redirect`    | yes      | Sign-in addresses, at least one. `https`, matched exactly             |
| `postLogout`  | no       | Addresses core may return a person to after sign-out                  |
| `backChannel` | no       | The address core posts a logout notice to                             |
| `scopes`      | no       | What it may ask for. Default `openid`, `profile`, `email`             |
| `type`        | no       | `confidential` (the default) or `public`. It cannot change afterwards |
| `trusted`     | no       | Default `false`. `roles` needs `true`                                 |
| `launcher`    | no       | Its launcher entry (below)                                            |

A `launcher`: `description`, `icon` and `launchUrl` are text, and `show` is true or false. An address follows
[core-app §3.7.3](../docs/specs/core-app.md).

---

## 2. `suite.lock`

Generated by `sv`, and committed. It MUST NOT be edited by hand.

```yaml
schema: 1
images:
  cli:
    ref: ghcr.io/sovereignfs/cli:1.4.0
    digest: sha256:1111111111111111111111111111111111111111111111111111111111111111
  core:
    ref: ghcr.io/sovereignfs/sovereign:0.49.0
    digest: sha256:2222222222222222222222222222222222222222222222222222222222222222
  database:
    ref: postgres:18
    digest: sha256:3333333333333333333333333333333333333333333333333333333333333333
  proxy:
    ref: caddy:2.10
    digest: sha256:4444444444444444444444444444444444444444444444444444444444444444
apps:
  notes:
    ref: ghcr.io/example/notes:1.2.0
    digest: sha256:5555555555555555555555555555555555555555555555555555555555555555
```

A digest is the image's multi-architecture one, so a lockfile written on one machine runs on another. Every hosted app in
`suite.yml` MUST be here, and nothing else may be. An external app runs nothing, and is not.

---

## 3. `secrets.age.yml`

Secrets the operator entered. It is YAML, a map from `core` or a hosted app's name to a map of variable names to values:

```yaml
core:
  SV_SMTP_PASSWORD: |
    -----BEGIN AGE ENCRYPTED FILE-----
    YWdlLWVuY3J5cHRpb24ub3JnL3YxCg==
    -----END AGE ENCRYPTED FILE-----
```

- A value MUST be armored age ciphertext, encrypted to every recipient in `suite.yml`.
- A name MUST carry the prefix of what it belongs to. It reaches the container through the `_FILE` form.
- It MUST NOT set what the deployment generates.
- The names are in the open, so a name MUST NOT itself be secret.

---

## 4. Changing the format

- `schema` is a whole number, and the same number versions `suite.yml`, `suite.lock` and `secrets.age.yml` together.
- A change that a current toolkit could misread MUST raise it. Adding an optional field with a default that changes nothing
  does not.
- Each version keeps its JSON Schema under `schemas/`, forever, and each number has a migration to the next in the toolkit.
- Only `sv upgrade` migrates a file. Every other command refuses a `schema` it does not read, and names the command to run.

## 5. `overrides/`

Optional, and applied last, for what `suite.yml` does not cover:

- `overrides/compose/<core|proxy|database|name>.yml` is a Compose override for that project;
- `overrides/caddy/*.caddy` are extra proxy sites, for hosts that are not part of the instance.

An override MUST NOT publish a port, change a network, or set anything `sv apply` refuses. Whatever else it does is the operator's
to answer for, and an upgrade does not check that it still applies.
