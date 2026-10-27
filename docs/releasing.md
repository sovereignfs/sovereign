# Releasing packages

Two packages are published to npm, under the names they have always had:

| Package               | What it is                                        | Licence                                  |
| --------------------- | ------------------------------------------------- | ---------------------------------------- |
| `@sovereignfs/ui`     | The design system: tokens and React components    | MPL-2.0 (icons derived from Lucide: ISC) |
| `@sovereignfs/bridge` | The device bridge between pages and native shells | MPL-2.0                                  |

Every other package is `private` for now and is not published. `apps/core` is a deployable,
not a package. The two published packages are MPL-2.0 so that apps under any licence can use
them (the other packages are MPL-2.0 too, for when they follow); `apps/core` and the
repository are AGPL-3.0-or-later ([README](../README.md#licence)).

## What a release is made of

- **A version, set in the pull request.** The package's own `version` follows semver by what
  changed in it ([AGENTS.md](../AGENTS.md) has the policy: `ui` and `bridge` are published
  contracts, so a patch never breaks, and a break needs a minor bump plus a migration note).
  The bump is its own commit, `ui-vX.Y.Z` or `bridge-vX.Y.Z`.
- **A tarball that is only what an app needs:** `dist/`, `LICENSE`, `README.md`, and for `ui`
  the `NOTICE` with Lucide's ISC licence. No source, tests, stories or configuration; no
  `workspace:` or `catalog:` dependency (pnpm rewrites them to real ranges when it packs).
- **Entry points in `dist/`.** In the repository `exports` point at `src/`; `publishConfig`
  repoints them at `dist/` when the package is packed.

## Before releasing

```bash
pnpm build
pnpm packages:check
```

`packages:check` packs each published package, inspects the tarball (the licence and notice are
there, every entry point exists, nothing that must not ship is in it, no workspace dependency)
and runs the real `pnpm publish --dry-run`. It publishes nothing. CI runs it on every pull
request that changes code, and a test (`scripts/__tests__/licences.test.ts`) keeps each
package's `package.json` and `LICENSE` in agreement.

## Releasing

The automated release workflow, with npm provenance, is decided separately and does not exist
yet. Until it does, a maintainer who can publish to the `@sovereignfs` scope releases by hand:

1. Check out `main` at the merge commit that carries the version bump; the tree is clean.
2. `pnpm install --frozen-lockfile && pnpm build && pnpm packages:check`.
3. `pnpm --filter @sovereignfs/ui publish` (or `@sovereignfs/bridge`). npm asks for the
   second factor. The `publishConfig` already sets public access.
4. Tag the commit `ui-vX.Y.Z` (or `bridge-vX.Y.Z`) and push the tag.

`@sovereignfs/bridge` has never been published from this repository; its first release is
the first time the name is claimed on npm, so check the scope is yours before step 3.

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
