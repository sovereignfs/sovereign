# Releasing

Everything is released from `main`, and `main` changes only through a **promotion pull request** from `develop`
([CONTRIBUTING](../CONTRIBUTING.md#promoting-develop-into-main)), merged with a merge commit. Its title, from
`pnpm promotion:draft`, names the versions it carries, with `Release` in front only when merging it is to publish all of
them. Version bumps are made on `develop` as before; nothing is tagged there.

**Merging a `Release` promotion releases it.** `.github/workflows/promotion.yml` checks the title against the code before
the merge (`pnpm release:check`: each version is the one in its `package.json`, and a `Release` title names only published
things not tagged yet). Once it is merged, `.github/workflows/release.yml` checks it again, tags the merge commit with each
version, and calls the publish workflows below for them, which publish and then make each version's GitHub release. A title
without `Release` publishes nothing. Pushing a tag by hand still releases, as below: to publish later a version promoted
without `Release`, tag the merge commit that brought it, or to try a failed release again. A tag is not a push to `main`, so
`main`'s protection does not stop it.

**Every published thing keeps a changelog**, in the Keep a Changelog form: `CHANGELOG.md` at the root for the platform and
its image, `tools/cli/CHANGELOG.md` for the toolkit and `create`, and one beside each published package, which ships it to
npm. A version's section (`## [X.Y.Z] - date`, dated the day it is set) is written in the change that sets the version; a
test fails when a published thing's version has none. Each publish workflow reads that section before it publishes anything
(`pnpm release:notes <tag>`), so a version without one is not released, and makes it the GitHub release's notes afterwards.

## What carries a version

Several things here have a version, each counted on its own; two of them being close in number means nothing.

| What                                                                                 | Version in                                  | Tag             | Released as                                           | How it moves                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------- | --------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The platform**: what an instance runs                                              | root `package.json`                         | `vX.Y.Z`        | the image, `ghcr.io/sovereignfs/sovereign:X.Y.Z`      | a minor per completed roadmap task, a patch for a fix between tasks; `1.0.0` marks the public release (AGENTS.md)                                                |
| **Core's app**                                                                       | `apps/core/package.json`                    | none            | nothing on its own: it is inside the image            | semver by what changed in core; its `core-vX.Y.Z` commits record it. Which core an operator runs is the platform version.                                        |
| **The toolkit**: `sv`, its image, `npm create @sovereignfs`                          | `tools/cli` and `tools/create`, one version | `cli-vX.Y.Z`    | `@sovereignfs/cli`, `@sovereignfs/create`, two images | semver by what changed for operators and for the apps the template makes                                                                                         |
| **A published package**: `ui`, `sdk`, `manifest`, `config`, `storage`, `pwa`, `auth` | its own `package.json`                      | `<name>-vX.Y.Z` | `@sovereignfs/<name>` on npm                          | semver as a contract (AGENTS.md). `sdk` started at `2.0.0` after the legacy repository's `1.x`; `ui` has taken a minor for every feature since its first release |
| **A private package**: `database`, `crypto`, `mailer`, …                             | its own `package.json`                      | none            | nothing: bundled or used inside this repository       | semver by what changed, never published                                                                                                                          |

A version is set on `develop` in the change that makes it, with its changelog section when it is published (below); it is
released when a promotion titled with it under `Release` is merged, or its tag is pushed. Not every version is released: one can be
promoted and tagged later.

Three things are released from this repository: a package to npm, core's image to the GitHub Container Registry
([below](#releasing-the-image)), and the operator's toolkit, which is both ([below](#releasing-the-toolkit)).

## Packages

Seven packages are published to npm:

| Package                 | What it is                                                                                                                       | Licence                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `@sovereignfs/ui`       | The design system: tokens and React components                                                                                   | MPL-2.0 (icons derived from Lucide: ISC) |
| `@sovereignfs/sdk`      | How an app's server calls core: tokens, failure, version support and sign-in                                                     | MPL-2.0                                  |
| `@sovereignfs/manifest` | The app manifest: its schemas, a validator, and `sovereign-manifest`, which makes the image label and port                       | MPL-2.0                                  |
| `@sovereignfs/config`   | The environment convention of `contracts/env.md`: settings declared once, read with a prefix, refused at start-up                | MPL-2.0                                  |
| `@sovereignfs/storage`  | The files people upload: a folder per person, a quota per person, served only to them (RFC 0004)                                 | MPL-2.0                                  |
| `@sovereignfs/pwa`      | What makes an app installable: its manifest, a service worker that keeps nothing of a person, an announced update (RFC 0001 A7)  | MPL-2.0                                  |
| `@sovereignfs/auth`     | The sign-in core and every app share: the better-auth preset, the session helpers, the pages' flows, core as a way in (RFC 0007) | MPL-2.0                                  |

Every other package is `private` for now and is not published, **`@sovereignfs/bridge`
included**: it is release-ready (licence, files, README) but marked `private`, so nothing can
publish it by accident. To publish it later, remove `"private"` from its `package.json`, add its
tag and directory to `publish.yml` and a case for it to `scripts/__tests__/publish-workflow.test.ts`,
and check the `@sovereignfs` scope on npm is yours: it has never been published, so its first
release claims the name. `apps/core` is a deployable, not a package: it is released as an image. The published package is
MPL-2.0 so that apps under any licence can use it (the other packages are MPL-2.0 too, for when
they follow); `apps/core` and the repository are AGPL-3.0-or-later ([README](../README.md#licence)).

### What a release is made of

- **A version and its changelog section, set in the pull request.** The package's own `version` follows semver by what
  changed in it ([AGENTS.md](../AGENTS.md) has the policy: `ui` is a published
  contract, so a patch never breaks, and a break needs a minor bump plus a migration note in
  [`docs/upgrade.md`](upgrade.md), or a major bump from `1.0.0`:
  [design system §4](specs/design-system.md)).
  The bump is its own commit, `ui-vX.Y.Z`, and carries the version's section in the package's `CHANGELOG.md`.
- **A tarball that is only what an app needs:** `dist/`, `LICENSE`, `README.md`, `CHANGELOG.md`, and for `ui`
  the `NOTICE` with Lucide's ISC licence. No source, tests, stories or configuration; no
  `workspace:` or `catalog:` dependency (pnpm rewrites them to real ranges when it packs).
- **Entry points in `dist/`.** In the repository `exports` point at `src/`; `publishConfig`
  repoints them at `dist/` when the package is packed.

### Before releasing

```bash
pnpm build
pnpm packages:check
```

`packages:check` packs each published package, inspects the tarball (the licence and notice are
there, every entry point exists, nothing that must not ship is in it, no workspace dependency)
and runs the real `pnpm publish --dry-run`. It publishes nothing. CI runs it on every pull
request that changes code, and a test (`scripts/__tests__/licences.test.ts`) keeps each
package's `package.json` and `LICENSE` in agreement.

### The SDK

`@sovereignfs/sdk` is published with the private packages it is built from (`@sovereignfs/api-client` and
`@sovereignfs/config`) **bundled into it**, code and types alike, so a published tarball names no package npm lacks. They are
`devDependencies` of the SDK for that reason; the check refuses a published package that depends on an unpublished one. `@sovereignfs/config` is
also published on its own, for apps that read their settings with it; the SDK still bundles its own copy.

- **Its versions start at `2.0.0`.** The legacy repository published the legacy SDK under this name up to `1.25.0`, and npm does
  not make a lower version `latest`, so the first release from here is `sdk-v2.0.0` ([sdk §12](specs/sdk.md)).
- **Its exports are marked** stable or experimental in `packages/sdk/src/stability.ts`, and a test holds that list to what each
  entry point exports and to [sdk §12](specs/sdk.md).
- **Each release states the core versions it supports**, in `sovereign.core` of its `package.json` and in its README. Raise the
  floor when the SDK starts to need something a core lacks, and say so in the version's commit.
- **Its root entry throws in a browser** (`sideEffects` keeps a bundler from dropping that import).
- A new app that uses only the published package should meet [sdk §14](specs/sdk.md); [Using the SDK](using-the-sdk.md) is the
  guide for it.

### The config package

`@sovereignfs/config` has no dependencies, so its tarball is its `dist/`, licence and README. It implements
[`contracts/env.md`](../contracts/env.md), which wins where the two disagree: a change to the convention changes the contract
first, then the package, and a behaviour an app could notice is at least a minor version.

### The manifest package

`@sovereignfs/manifest` is published with nothing bundled in that npm lacks: its one runtime dependency (`ajv`) is bundled, and the
JSON Schemas are read from `contracts/schemas` at build time, where they are the one copy. Its `sovereign-manifest` command is the
package's `bin`, and `packages:check` holds it to a tool's rules (in `dist/`, in the tarball, starting with `#!`).

- **It is a dependency of the app template.** An app made by `npm create @sovereignfs app` has it as a development dependency
  (`tools/create/src/versions.ts`, held by a test to this package's version), so **release it before a toolkit release that
  makes new apps**: `npm create @sovereignfs` resolves the app's lockfile from npm, and fails while the package is not there.
  The first release is `manifest-v0.1.0`.
- **The toolkit bundles it.** `sv` validates a manifest with the same code (`tools/cli` builds it in), so a toolkit release carries the
  manifest versions the package had when it was built (`RELEASE.manifests` is `supportedVersions`).
- **A new manifest version** is a minor release of the package, with its schema added to `contracts/schemas/`; a test fails if a schema file is not
  one the package reads. `manifest-v0.1.0` carries manifests 1 and 2, and `manifest-v0.2.0` adds 3.

### The sign-in package

`@sovereignfs/auth` is published with the private packages it is built from (`@sovereignfs/crypto` and `@sovereignfs/database`)
**bundled into it**, code and types, as the SDK is; they are its `devDependencies`. `@sovereignfs/config` and `@sovereignfs/sdk` are
published, and are its dependencies. better-auth and its passkey plugin are pinned to one exact version (auth.md §11), and the browser
entries reach nothing of the server's (a test, and the built files' imports).

- **It is a dependency of the app template,** with the SDK release it is built on and the `@sovereignfs/ui` release whose forms the
  template's pages use (`tools/create/src/versions.ts`, held by a test to each package's version). As with the manifest package,
  **release them before a toolkit release that makes new apps**: the first toolkit to make an app on it is `cli-v0.21.0`, which needs
  `auth-v0.3.0`, `sdk-v2.9.0` and `ui-v0.102.0` on npm.

### Releasing a package

Merging a promotion titled with the package's version under `Release` releases it, or pushing its tag does: `ui-vX.Y.Z` releases `@sovereignfs/ui`, `sdk-vX.Y.Z` releases
`@sovereignfs/sdk`, `manifest-vX.Y.Z` releases `@sovereignfs/manifest`, `config-vX.Y.Z` releases `@sovereignfs/config`, and
`storage-vX.Y.Z` releases `@sovereignfs/storage`, `pwa-vX.Y.Z` releases `@sovereignfs/pwa`, and `auth-vX.Y.Z` releases `@sovereignfs/auth`.
`.github/workflows/publish.yml` does the rest, and **publishes
nothing unless every one of these holds**:

1. the full CI passes on the tagged commit (the same suite as a pull request, every job);
2. the tagged commit is on `main`, so a tag put on a branch by mistake cannot release;
3. the tag matches the version in the package's `package.json` (`ui-v0.85.2` needs `0.85.2`);
4. the version has a section in the package's `CHANGELOG.md`;
5. the build and `pnpm packages:check` pass, so the tarball is the one described above.

Then it runs `pnpm publish --access public --provenance`, authenticated with the Actions secret
`NPM_TOKEN`. **Provenance** makes npm show the package as built from this repository at this
commit. The release job installs without any cache, so nothing it publishes depends on what
another run could have stored. Once published, it makes the GitHub release for the tag from the changelog section.

To release:

1. Land the version bump (the `ui-vX.Y.Z` commit, with its changelog section) on `develop`.
2. Merge the promotion pull request titled `Release ui-v0.85.2` into `main`. The Release run tags the merge commit and
   publishes; by hand instead: `git switch main && git pull && git tag ui-v0.85.2 && git push origin ui-v0.85.2`.
3. Watch the Release (or Publish) run in the Actions tab. A published version cannot be replaced, so if a step
   fails after npm accepted the package, bump the version and release again.

`NPM_TOKEN` is an npm automation token with publish rights on the `@sovereignfs` scope; it
expires or is revoked from the npm side, and a failing release with an authentication error
means it needs replacing. `@sovereignfs/bridge` has never been published: its first release is the
first time the name is claimed on npm, so check the scope is yours before tagging it.

If the workflow itself is broken, a maintainer can release by hand from a clean checkout of
`main` (`pnpm install --frozen-lockfile && pnpm build && pnpm packages:check`, then
`pnpm --filter @sovereignfs/ui publish --access public`, with npm's second factor), and tag the
commit afterwards. The legacy repository's (`sovereignfs/sovereign-legacy`) publish workflows must be retired before the
first release from here, so that two places cannot release the same package.

## Releasing the image

Merging a promotion titled with the platform's version under `Release` releases the image, or pushing its tag does: `vX.Y.Z` publishes `ghcr.io/sovereignfs/sovereign` for `linux/amd64` and
`linux/arm64`, tagged `X.Y.Z`, `X.Y` and `latest`. `.github/workflows/publish-image.yml` does the rest, and **publishes
nothing unless every one of these holds**:

1. the full CI passes on the tagged commit, whose `image` job boots every compose setup from the image, and whose
   acceptance suite runs on each database;
2. the tagged commit is on `main`, so a tag put on a branch by mistake cannot release;
3. the tag is a plain `vX.Y.Z` that matches the root `package.json`;
4. the version has a section in the root `CHANGELOG.md`, which becomes the GitHub release's notes.

The build uses no cache, so nothing it publishes depends on what another run stored, and it attaches a provenance
statement and a software bill of materials. It authenticates with the run's own `GITHUB_TOKEN`, so there is no secret to
keep or replace. The `arm64` half is built under emulation, which makes a release slow: most of an hour is normal.

The image carries the platform version, the root `package.json`, bumped in the `vX.Y.Z` commit. `apps/core`'s own version
keeps its `core-vX.Y.Z` commits but is no tag and releases nothing.

To release:

1. Land the commit that carries the root version bump, with its changelog section, on `develop`.
2. Merge the promotion pull request titled `Release v1.2.3` into `main`. The Release run tags the merge commit and
   publishes; by hand instead: `git switch main && git pull && git tag v1.2.3 && git push origin v1.2.3`.
3. Watch the Release (or Publish image) run in the Actions tab.
4. From somewhere that has never logged in to GitHub's registry, check it arrived:
   `docker pull ghcr.io/sovereignfs/sovereign:1.2.3`.

A published version is not replaced. If a release is bad, fix it and release the next version, and say so in
`docs/upgrade.md` if operators need to act. On the first release, check the package's visibility in the
organization's Packages settings: it must be public for the `docker pull` above to work.

## Releasing the toolkit

The operator's toolkit is `@sovereignfs/cli` (`sv`), `@sovereignfs/create` (`npm create @sovereignfs`) and `ghcr.io/sovereignfs/cli`,
the image the server runs `sv apply` from, with `ghcr.io/sovereignfs/pgbouncer` (`tools/pgbouncer`), the optional connection pooler,
published at the same version in the same job because `suite.lock` pins it by the toolkit's tag. They are one release at one version, on the tag `cli-vX.Y.Z`, and
`.github/workflows/publish-cli.yml` does the rest. They are AGPL-3.0-or-later and are run, not imported, which is why the package
check treats them apart from the libraries above (a `bin` and not an exports map).

The workflow **publishes nothing unless** the full CI passes on the tagged commit, the commit is on `main`, the tag matches the
`version` of both `tools/cli` and `tools/create`, the version has a section in `tools/cli/CHANGELOG.md`, and every Sovereign package the app template names (`tools/create/src/versions.ts`)
is on npm in its range (`pnpm template:check-published`): release those packages first. The order is the image, then `@sovereignfs/cli`, then `@sovereignfs/create`, because a
repository made by `create@X` pins the image of toolkit X and cannot be set up until it exists. The image is signed by the build with
the run's `GITHUB_TOKEN`; the packages are published with provenance by `NPM_TOKEN`, which only the last step holds.

The toolkit's own version appears in three places that a test holds together: `tools/cli/package.json`, `tools/create/package.json`
and `RELEASE.version` in `tools/cli/src/release.ts`. A toolkit release also says which core it was made for (`RELEASE.newestCore`): `sv upgrade` moves an instance to it, and `sv setup`
starts a new instance on the newest published core in the supported range, never older than it (and on it when the registry cannot be
asked), so a core release needs no toolkit release to be what new instances start on.

To release: land the commit that sets those versions, `newestCore` and the changelog section on `develop`, and merge the promotion pull
request titled `Release cli-vX.Y.Z` into `main`; the Release run tags its merge commit and publishes (or tag it `cli-vX.Y.Z` by hand and
push the tag).
Then, from a machine that has never logged in to GitHub's registry, check `docker pull ghcr.io/sovereignfs/cli:X.Y.Z`, and that
`npm create @sovereignfs@X.Y.Z` makes a repository that `./sv setup` can finish. On the first release, make the `cli` package public
in the organization's Packages settings, and check the `@sovereignfs` scope on npm is yours.

## Storybook

The design system's Storybook is built in this repository and published to its own repository,
`sovereignfs/storybook`, whose GitHub Pages serves <https://sovereignfs.github.io/storybook/>.
`.github/workflows/storybook.yml` does the publishing:

- **It is published with the design system:** when a `Release` promotion publishes `ui-vX.Y.Z`, the release workflow
  builds Storybook from that tag and puts it live once the packages are published.
- Push a tag `sb-vX.Y.Z` on a commit of `main` (it need not match a package version; it marks the commit to put
  live), or start the workflow by hand from the Actions tab.
- It pushes the static build to the `gh-pages` branch of `sovereignfs/storybook`, so the address
  does not change and this repository's own Pages settings are not used.
- **It needs one secret:** `STORYBOOK_DEPLOY_TOKEN`, an Actions secret in this repository holding a
  personal access token that can write to `sovereignfs/storybook` (fine-grained: Contents read and
  write on that one repository). The token expires: when a deploy fails with an authentication
  error, create a new one and replace the secret. Until the secret is set the workflow stops at its
  first step and says so.
- Every pull request that changes code builds Storybook in CI, so a story that no longer
  bundles fails there, not at deploy time.
