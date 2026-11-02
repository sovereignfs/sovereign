# RFC 0003 — Apps of their own: one manifest file, manifest 2, and the SDK's notices

|                |                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Proposed                                                                                                                                                                                        |
| **Date**       | November 2026                                                                                                                                                                                   |
| **Author**     | Claude Code, for review                                                                                                                                                                         |
| **Scope**      | `contracts/app-manifest.md` and its schemas; `contracts/env.md` §1; `docs/specs/operator-cli.md` §2.2, §4.2; `docs/specs/sdk.md` §9; `tools/cli`, `tools/create`, `packages/sdk`; a new package |
| **Tasks**      | Numbered when accepted                                                                                                                                                                          |
| **Supersedes** | The `sovereign-plugin-template` repository, which describes the plugin model this repository no longer has                                                                                      |

## Summary

A Sovereign app is a program of its own. What ties it to Sovereign is a set of **shared packages** (`@sovereignfs/ui`, the SDK), **sign-in
through core if the app chooses it**, and the **manifest and environment conventions** the toolkit reads to host it. Nothing else. RFC 0002
set this up; building the first app outside this repository against it showed four places where it falls short:

1. **The manifest is written twice.** The template keeps `sovereign.manifest.json` and an escaped copy of it in its Dockerfile's `LABEL`,
   synced by a script each app copies. This RFC makes the file at the app's source root the manifest, and a **published package**
   (`@sovereignfs/manifest`) validates it and turns it into the label and the port at build time. `sv` gives every hosted app `PORT`, so the
   port is written once.
2. **Signing in through core is compulsory.** **Manifest 2** makes `signIn` optional.
3. **Its prefix and its secrets are fixed in shape.** Manifest 2 writes `prefix` in lowercase, uses it as the default app name, and lets a
   `generate` entry say how many bytes.
4. **The SDK's logout and account-deletion handling needs the SDK's own sessions.** The SDK exports the **two token verifiers** on their own,
   for an app whose sessions are someone else's.

Manifest 1 stays readable for good. Nothing here gives core a new duty or names an app.

## Motivation

Fjord Web (in `sovereignfs/fjord`) is the first app built outside this repository to be hosted by `sv`. It has its own repository, image and
release cycle, and runs without Sovereign. It also signs in through core, uses `@sovereignfs/ui`, and needs a PostgreSQL database from the
instance. That is exactly the app RFC 0002 meant, and putting it on an instance found the following.

- **A monorepo cannot use the template's sync script.** Fjord Web's image is built from the root of its repository, not from the app's
  folder, so the script that rewrites a `LABEL` line in `./Dockerfile` does not fit. Every app outside this repository writes its own copy
  of that script, or keeps the label by hand. Neither is checked against the schema the toolkit applies.
- **The port is written in four places**: the manifest, the Dockerfile's `ENV PORT` and `EXPOSE`, and its health check. Only the manifest's
  copy is what `sv` uses, and nothing makes the image listen there.
- **`prefix` is a second spelling of the app's name.** `npm create @sovereignfs app my-notes` already derives `MYNOTES` from the folder's
  name. An author asked for `"prefix": "fjord"`: the variables are `FJORD_*` either way, but the manifest reads as a name, not as a shout.
- **Fjord Web has its own sign-in** (better-auth: local accounts, passkeys, and Sovereign through OpenID Connect). It chooses core's sign-in
  when it is hosted. An app whose people are not the instance's people — a public status page, a shared kiosk — has nothing to sign in
  with, and app-manifest §4 says it MUST.
- **Its encryption key must be exactly 32 bytes.** `generate` always makes 48, so the operator types the key into `secrets.age.yml`
  instead.
- **It cannot honour a back-channel logout through the SDK.** `sv.auth.handleBackChannelLogout` verifies the token and then ends the SDK's
  sessions (`deleteMatching`). Fjord Web's sessions are better-auth's. Verifying core's logout token by hand means copying sdk §9.1's rules
  (type, signature, issuer, audience, age, event, `jti` replay, no `nonce`), which is what §1.1 exists to prevent.

## Current state

Checked in the repository, November 2026:

- `contracts/app-manifest.md` §1: the manifest is the image label `io.github.sovereignfs.app-manifest`, or an `https` address. The file
  `sovereign.manifest.json` is named only by operator-cli §2.2, as what the template holds.
- `tools/create/template/app`: `sovereign.manifest.json`, a Dockerfile ending in an escaped `LABEL` copy of it, and `scripts/manifest.mjs`
  (check or write that line). The publish workflow that operator-cli §2.2 lists is not in the template yet.
- `tools/cli/src/manifest.ts` validates against `contracts/schemas/app-manifest-v1.schema.json` through `schemaProblems`, refuses
  `prefix: "SV"`, and refuses an unknown field. `prefix` matches `^[A-Z][A-Z0-9]*$`.
- `tools/cli/src/apply/render.ts` and `apps.ts` build an app's environment from `manifest.prefix`. `PORT` is not set; the image's own
  default is relied on.
- `packages/sdk/src/auth.ts`: `#verifyNotice` holds the token rules for both notices and is private. The `jti` check uses the session
  store's `seen` records.
- `sovereign-plugin-template` (its own repository) describes plugins composed into a shell at a `routePrefix`, an SDK injected by a runtime,
  and `"latest"` dependencies. None of that exists here any more.

## Goals

- The manifest is one file in the app's source, and every image built from it carries it exactly, from any repository layout.
- An app can be hosted without signing in through core.
- The manifest says each fact once: the port, and the prefix in the form an author writes a name in.
- An app with its own sessions can act on core's logout and account-deletion notices through the SDK, with sdk §9.1's rules unchanged.
- Every image published with manifest 1 stays hostable.

## Non-goals

- **More than one process per app** (a web process and a worker). It needs its own design, and no app needs it yet.
- **An app catalogue**, or adding an app from a repository that holds several (`sv app add --git` looks for `ghcr.io/OWNER/REPO`).
  `--image` covers a monorepo today, and `sv app upgrade` follows the image's repository.
- **A launcher entry for an app with no client** (below).
- **A conformance runner for app-manifest §4** (`sv app check --image`). Worth having; a later proposal.

## Design

### 1. One manifest file, and `@sovereignfs/manifest`

`contracts/app-manifest.md` §1 becomes:

> An app's manifest is the file `sovereign.manifest.json` at the root of its source. An image built from it carries it as the value of the
> label `io.github.sovereignfs.app-manifest`, made from the file when the image is built, so that it can be read from the registry without
> pulling the image. An operator MAY instead give an `https` address for one.

A new package, **`@sovereignfs/manifest`** (MPL-2.0, `packages/manifest`), is the one implementation of the format for both sides:

| Export                                 | What it does                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `schemas`                              | Every manifest version's JSON Schema, as published under `contracts/schemas/`                                          |
| `validate(document)`                   | The schema and the rules a schema cannot say, with every problem named; what `tools/cli` calls today                   |
| `normalise(document)`                  | What any version means in the latest one's terms: the variable prefix, whether there is sign-in, `generate` with sizes |
| `sovereign-manifest check [dir]`       | Validates `dir/sovereign.manifest.json`; exits non-zero naming each problem                                            |
| `sovereign-manifest label [dir]`       | Prints the label's value: the file, validated and minified                                                             |
| `sovereign-manifest docker-args [dir]` | Prints `--label io.github.sovereignfs.app-manifest=… --build-arg PORT=<port>`, for `docker build` and `buildx`         |

The toolkit depends on it, so `sv` and an app's build agree on what a valid manifest is by depending on the same version. The template drops
`scripts/manifest.mjs` and its Dockerfile's `LABEL` line. Its Dockerfile takes `ARG PORT` and sets `ENV PORT=${PORT}` and
`EXPOSE ${PORT}`, and its publish workflow (operator-cli §2.2, added with this) passes `docker-args` to `docker/build-push-action`. A
monorepo calls the same command with the app's folder.

**The port.** `sv` gives every hosted app `PORT=<port>` (app-manifest §3), and §4 says an app MUST listen on `PORT`. `PORT` is the
platform's, so `contracts/env.md` §1 already lets it go unprefixed. The proxy and the health check use the manifest's port, so the
container now listens where they look whatever its image defaults to. This is additive and goes in manifest 1 as well.

### 2. Manifest 2

```json
{
  "manifest": 2,
  "prefix": "notes",
  "name": "Notes",
  "port": 3000,
  "health": "/api/health",
  "signIn": {
    "redirect": ["/auth/callback"],
    "scopes": ["openid", "profile", "email"]
  },
  "database": { "pooling": "transaction" },
  "generate": ["NOTES_AUTH_SECRET", { "name": "NOTES_ENCRYPTION_KEY", "bytes": 32 }],
  "core": ">=0.57.0 <1.0.0"
}
```

What changes from manifest 1:

| Field      | Manifest 1                           | Manifest 2                                                                                                                            |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`   | `^[A-Z][A-Z0-9]*$`, not `SV`         | `^[a-z][a-z0-9]*$`, not `sv`. The variables are its upper case (`notes` → `NOTES_URL`). It is the default name in `sv app add [NAME]` |
| `signIn`   | Required                             | Optional (below)                                                                                                                      |
| `core`     | Required                             | Required with `signIn`; optional without                                                                                              |
| `generate` | Variable names; each 48 random bytes | Each a name, or `{ "name", "bytes" }` with `bytes` from 16 to 64. A name alone is still 48. The value is base64 either way            |

Everything else is as in manifest 1, and unknown fields are still refused.

**The prefix in lowercase.** It is written as an app's name is written, and its upper case is what every variable starts with, which
`contracts/env.md` §1 keeps upper case. It has no hyphens because it becomes part of a variable name. `sv app add` takes it as the app's
name when none is given; a name is still the operator's, and a second copy of an app needs one.

**Without `signIn`** an app is hosted with no client at core: no `<PREFIX>_CORE_URL`, `_CORE_CLIENT_ID` or `_CORE_CLIENT_SECRET`, and
nothing registered. In core an app _is_ a client presented through its launcher entry (core-app §1.2), so such an app has **no launcher
entry**. It still gets its subdomain, certificate, network, database and secrets. An app that has `signIn` MUST accept sign-in through core
as now (with PKCE, `docs/connecting-an-app.md`); it MAY offer other ways in as well, which are its own business.

**Versions.** `manifest` changes because a toolkit that reads 1 would misread a lowercase prefix or a missing `signIn` as invalid rather than
as newer. A toolkit refuses a version it does not read and names the release that reads it (app-manifest §5). A toolkit that reads 2 reads
1 forever, through `normalise`. The template moves to 2 in the release whose toolkit reads it.

### 3. The SDK's notices, verified on their own

Two experimental exports, with the rules of sdk §9.1 moved out of the private `#verifyNotice` and nothing changed in them:

```ts
import { verifyAccountDeletedToken, verifyLogoutToken } from '@sovereignfs/sdk';

const notice = await verifyLogoutToken(request, {
  coreUrl, // the issuer
  clientId, // the audience
  seen, // (jti: string, expiresAt: number) => Promise<boolean>: true if it was seen before; records it if not
});
// { sub?: string, sid?: string }, or throws InvalidNoticeError (answer 400) or CoreUnavailableError (answer 503)
```

- They take a web-standard `Request` (a `POST` whose form holds `logout_token` or `account_deleted_token`) or the token itself.
- **`seen` is required**, not optional: a verifier without replay protection is the mistake this export must not make easy. An app keeps it
  in its own database.
- `handleBackChannelLogout` and `handleAccountDeleted` are rebuilt on them, with the session store's `seen` records as their `seen`, and
  answer as they do now.
- An app built on them answers the notices itself, and for account deletion MUST answer `200` only after it has deleted what it holds of
  the person, as sdk §9.1 already says for the handler.

### 4. Retiring `sovereign-plugin-template`

Its README is replaced by a short page saying the plugin model is gone, and pointing to `npm create @sovereignfs app`,
`contracts/app-manifest.md` and `docs/using-the-sdk.md`. The repository is then archived on GitHub by its owner, not deleted, so existing
links still explain themselves.

## Security and privacy

- **The label is the file, minified.** `sovereign-manifest label` validates before it prints, so an image cannot carry a manifest the
  toolkit would refuse because of a stale copy. What `sv app add` shows the operator is unchanged.
- **An app without `signIn` holds less.** It gets no client secret and no token, and core knows nothing of it.
- **`bytes` is bounded** (16 to 64). Below 16 a secret is guessable; above 64 nothing gains.
- **`prefix` cannot be `sv`** in either case, so no app reads core's variables.
- **`PORT` is not a secret** and is already what the platform reads.
- **The verifiers keep every rule**, and `seen` cannot be left out. An app that implements `seen` wrongly weakens replay protection for
  itself only: a replayed logout ends sessions already ended, and a replayed deletion deletes what is already gone.

## Alternatives considered

- **Keep the hand-copied label and a script per app.** It works in one repository layout, is copied by every app, and is never checked
  against the schema the toolkit applies.
- **Read the manifest from the app's git repository** instead of the image. It ties hosting to a git host and a branch, and the image is
  what runs: the label is the one copy that cannot disagree with it.
- **An `id` field beside an uppercase `prefix`.** Two fields for one name, and `prefix` would still be the one that matters.
- **Accept either case in `prefix`.** Two spellings of every app's prefix in the wild, and nothing gained by the second.
- **Keep `signIn` required and allow other methods beside it.** It answers Fjord Web, but not an app with no people to sign in.
- **A launcher entry for an app with no client.** Core would hold apps it cannot otherwise know, against core-app §1.2. Later, if wanted.
- **Infer a secret's size from its name** (`_KEY` is 32). A guess about a secret's format is how one gets the wrong length.
- **Let apps verify the notices with `jose` themselves.** Every app copies sdk §9.1, and the copies drift.
- **Delete the plugin template.** Its links would 404 instead of explaining.

## Testing

- **`@sovereignfs/manifest`:** the schemas against a corpus of valid and invalid manifests of both versions; `normalise` of every valid one;
  `label` round-trips (the label parsed is the file); `docker-args` quotes a manifest with every character JSON allows.
- **The toolkit:** `sv app add` and `sv apply` with a manifest 1 image and a manifest 2 image, with and without `signIn`; `PORT` in the
  rendered environment; a `generate` entry of 32 bytes; refusals of `prefix: "sv"`, `bytes: 8`, and a manifest 2 without `core` but with
  `signIn`. A test that an older schema still validates every manifest 1 in the corpus.
- **The template:** `create.test.ts` checks the files, and CI builds the image with `docker-args` and checks its label equals the file.
- **The SDK:** the verifiers against the same vectors `handle*` is tested with (wrong type, signature, issuer, audience, age, event, a `nonce`,
  a replayed `jti`), and `handle*` unchanged in behaviour.

## Rollout

In order, each its own task once this is accepted:

1. **The contracts and specs:** `contracts/app-manifest.md` (§1, §2, §3 and §4, and manifest 2), `contracts/schemas/app-manifest-v2.schema.json`,
   `contracts/env.md` §1 (the lowercase prefix), operator-cli §2.2 and §4.2, sdk §9. Docs only, before any code.
2. **`@sovereignfs/manifest`, and `PORT`:** the package; `tools/cli` validating through it; `sv` giving `PORT`; the template's Dockerfile,
   publish workflow and `docker-args`. Manifest 1 only.
3. **Manifest 2:** in the package and the toolkit, and the template moved to it.
4. **The SDK verifiers:** a minor release of `@sovereignfs/sdk`.
5. **The plugin template:** its README, then archiving.

Steps 2 and 4 are independent of each other; 3 needs 2.

## Open questions

1. **A new package, or the SDK?** sdk §1.1 keeps the SDK to what talks to core, and a build step does not. Leaning towards the new package.
2. **`PORT` for manifest 1 apps too?** It changes what an existing app is given. Leaning towards yes: every app made from the template and
   every Next.js app already reads it.
3. **A lowercase prefix with digits first** (`2fa`)? Leaning towards no: it must start with a letter, as now.
4. **What core version does manifest 2 need?** None of its own: the toolkit is what reads it. Leaning towards stating only the toolkit
   release.

## Decision requested

Approve the design, answer the open questions (or accept the leanings), and confirm the order in the rollout. On approval, the outcome goes
into the contracts and specs before any code.

## Outcome

Not decided.
