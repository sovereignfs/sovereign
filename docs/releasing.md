# Releasing

Three things are released from this repository: a package to npm, core's image to the GitHub Container Registry
([below](#releasing-the-image)), and the operator's toolkit, which is both ([below](#releasing-the-toolkit)).

## Packages

Two packages are published to npm:

| Package            | What it is                                                                   | Licence                                  |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `@sovereignfs/ui`  | The design system: tokens and React components                               | MPL-2.0 (icons derived from Lucide: ISC) |
| `@sovereignfs/sdk` | How an app's server calls core: tokens, failure, version support and sign-in | MPL-2.0                                  |

Every other package is `private` for now and is not published, **`@sovereignfs/bridge`
included**: it is release-ready (licence, files, README) but marked `private`, so nothing can
publish it by accident. To publish it later, remove `"private"` from its `package.json`, add its
tag and directory to `publish.yml` and a case for it to `scripts/__tests__/publish-workflow.test.ts`,
and check the `@sovereignfs` scope on npm is yours: it has never been published, so its first
release claims the name. `apps/core` is a deployable, not a package: it is released as an image. The published package is
MPL-2.0 so that apps under any licence can use it (the other packages are MPL-2.0 too, for when
they follow); `apps/core` and the repository are AGPL-3.0-or-later ([README](../README.md#licence)).

### What a release is made of

- **A version, set in the pull request.** The package's own `version` follows semver by what
  changed in it ([AGENTS.md](../AGENTS.md) has the policy: `ui` is a published
  contract, so a patch never breaks, and a break needs a minor bump plus a migration note in
  [`docs/upgrade.md`](upgrade.md), or a major bump from `1.0.0`:
  [design system §4](specs/design-system.md)).
  The bump is its own commit, `ui-vX.Y.Z`.
- **A tarball that is only what an app needs:** `dist/`, `LICENSE`, `README.md`, and for `ui`
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
`devDependencies` of the SDK for that reason; the check refuses a published package that depends on an unpublished one. Publishing
them on their own is a later decision.

- **Its versions start at `2.0.0`.** The legacy repository published the legacy SDK under this name up to `1.25.0`, and npm does
  not make a lower version `latest`, so the first release from here is `sdk-v2.0.0` ([sdk §12](specs/sdk.md)).
- **Its exports are marked** stable or experimental in `packages/sdk/src/stability.ts`, and a test holds that list to what each
  entry point exports and to [sdk §12](specs/sdk.md).
- **Each release states the core versions it supports**, in `sovereign.core` of its `package.json` and in its README. Raise the
  floor when the SDK starts to need something a core lacks, and say so in the version's commit.
- **Its root entry throws in a browser** (`sideEffects` keeps a bundler from dropping that import).
- A new app that uses only the published package should meet [sdk §14](specs/sdk.md); [Using the SDK](using-the-sdk.md) is the
  guide for it.

### Releasing a package

Pushing a tag releases the package: `ui-vX.Y.Z` releases `@sovereignfs/ui`, and `sdk-vX.Y.Z` releases
`@sovereignfs/sdk`.
`.github/workflows/publish.yml` does the rest, and **publishes
nothing unless every one of these holds**:

1. the full CI passes on the tagged commit (the same suite as a pull request, every job);
2. the tagged commit is on `main`, so a tag put on a branch by mistake cannot release;
3. the tag matches the version in the package's `package.json` (`ui-v0.85.2` needs `0.85.2`);
4. the build and `pnpm packages:check` pass, so the tarball is the one described above.

Then it runs `pnpm publish --access public --provenance`, authenticated with the Actions secret
`NPM_TOKEN`. **Provenance** makes npm show the package as built from this repository at this
commit. The release job installs without any cache, so nothing it publishes depends on what
another run could have stored.

To release:

1. Merge the pull request that carries the version bump (the `ui-vX.Y.Z` commit).
2. Tag the merge commit and push the tag: `git tag ui-v0.85.2 && git push origin ui-v0.85.2`.
3. Watch the Publish run in the Actions tab. A published version cannot be replaced, so if a step
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

Pushing a version tag releases the image: `vX.Y.Z` publishes `ghcr.io/sovereignfs/sovereign` for `linux/amd64` and
`linux/arm64`, tagged `X.Y.Z`, `X.Y` and `latest`. `.github/workflows/publish-image.yml` does the rest, and **publishes
nothing unless every one of these holds**:

1. the full CI passes on the tagged commit, whose `image` job boots every compose setup from the image, and whose
   acceptance suite runs on each database;
2. the tagged commit is on `main`, so a tag put on a branch by mistake cannot release;
3. the tag is a plain `vX.Y.Z` that matches the root `package.json`.

The build uses no cache, so nothing it publishes depends on what another run stored, and it attaches a provenance
statement and a software bill of materials. It authenticates with the run's own `GITHUB_TOKEN`, so there is no secret to
keep or replace. The `arm64` half is built under emulation, which makes a release slow: most of an hour is normal.

The image carries the platform version, the root `package.json`, bumped in the `vX.Y.Z` commit. `apps/core`'s own version
keeps its `core-vX.Y.Z` commits but is no tag and releases nothing.

To release:

1. Land the commit that carries the root version bump on `main`.
2. Tag that commit and push the tag: `git tag v1.2.3 && git push origin v1.2.3`.
3. Watch the Publish image run in the Actions tab.
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

The workflow **publishes nothing unless** the full CI passes on the tagged commit, the commit is on `main`, and the tag matches the
`version` of both `tools/cli` and `tools/create`. The order is the image, then `@sovereignfs/cli`, then `@sovereignfs/create`, because a
repository made by `create@X` pins the image of toolkit X and cannot be set up until it exists. The image is signed by the build with
the run's `GITHUB_TOKEN`; the packages are published with provenance by `NPM_TOKEN`, which only the last step holds.

The toolkit's own version appears in three places that a test holds together: `tools/cli/package.json`, `tools/create/package.json`
and `RELEASE.version` in `tools/cli/src/release.ts`. A toolkit release also says which core it was made for (`RELEASE.newestCore`): `sv upgrade` moves an instance to it, and `sv setup`
starts a new instance on the newest published core in the supported range, never older than it (and on it when the registry cannot be
asked), so a core release needs no toolkit release to be what new instances start on.

To release: land the commit that sets those versions and `newestCore` on `main`, tag it `cli-vX.Y.Z`, push the tag, and watch the run.
Then, from a machine that has never logged in to GitHub's registry, check `docker pull ghcr.io/sovereignfs/cli:X.Y.Z`, and that
`npm create @sovereignfs@X.Y.Z` makes a repository that `./sv setup` can finish. On the first release, make the `cli` package public
in the organization's Packages settings, and check the `@sovereignfs` scope on npm is yours.

## Storybook

The design system's Storybook is built in this repository and published to its own repository,
`sovereignfs/storybook`, whose GitHub Pages serves <https://sovereignfs.github.io/storybook/>.
`.github/workflows/storybook.yml` does the publishing:

- Push a tag `sb-vX.Y.Z` (it need not match a package version; it marks the commit to put
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
