# Releasing **TITLE**

The sections above and below the shared one are this repository's own (what is particular to how it publishes); the shared one is
written by `npm create @sovereignfs app sync` and is the same in every repository of the suite.

<!-- sovereign:shared:begin -->

A release is a promotion of `develop` into `main` that says it is one. There is no release script to run.

1. **Set the version and its changelog section on `develop`,** in the change that makes them: `version` in `package.json` (semver: a
   fix is a patch, a feature a minor, a break a major) and a section `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`, saying in plain words
   what changed for someone upgrading. The section is the release's notes; a promotion titled `Release` is refused without it.
2. **Open the promotion pull request** from `develop` into `main`, titled **`vX.Y.Z`**, or **`Release vX.Y.Z`** when merging it is to
   publish that version. The **Promotion** check holds the title to the code: the version must be the one in `package.json`, and a
   `Release` title must name a version not tagged yet, with its changelog section. Editing the title runs it again.
3. **Merge it with a merge commit** (the only method `main` allows). For a `Release` title, the **Release** workflow checks the title
   against the merged code, tags the merge commit `vX.Y.Z`, and calls `.github/workflows/publish.yml`, which runs the app's checks,
   publishes the image to `ghcr.io/<owner>/<repository>:X.Y.Z` and makes the GitHub release from the changelog section.

A version promoted without `Release` can be published later by pushing its tag on the merge commit that brought it:

```bash
git switch main && git pull
git tag vX.Y.Z <merge commit> && git push origin vX.Y.Z
```

The promotion check and the release are workflows every app of the suite shares, kept in
[sovereignfs/sovereign](https://github.com/sovereignfs/sovereign/tree/main/.github/workflows) and run with the version of
`@sovereignfs/create` this app pins in `package.json`.

<!-- sovereign:shared:end -->
