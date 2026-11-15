# Releasing **TITLE**

The sections above and below the shared one are this repository's own (what is particular to how it publishes); the shared one is
written by `npm create @sovereignfs app sync` and is the same in every repository of the suite.

<!-- sovereign:shared:begin -->

This repository releases several components, each with its own version, tag and changelog, listed in `sovereign.json`. A release is a
promotion of `develop` into `main` that says which of them it publishes. There is no release script.

1. **Set each component's version and its changelog section on `develop`,** in the change that makes them: the version in the file
   `sovereign.json` names for it (semver: a fix is a patch, a feature a minor, a break a major), and a section `## [X.Y.Z] - YYYY-MM-DD`
   in its changelog, saying in plain words what changed for someone upgrading. The section is the release's notes.
2. **Open the promotion pull request** from `develop` into `main`, titled with the versions it carries, by their tags (each component's tag
   prefix, then `vX.Y.Z`, such as `web-v1.2.0`), and starting with **`Release`** when merging it is to publish them:
   `Release web-v1.2.0, cli-v0.6.0`. The **Promotion** check holds the title to the code: each version must be its component's current
   one, and under `Release` not tagged yet, with its changelog section. Editing the title runs it again.
3. **Merge it with a merge commit** (the only method `main` allows). For a `Release` title, the **Release** workflow checks the title
   against the merged code, tags the merge commit with each version, and calls each component's publish workflow with its tag.

A version promoted without `Release` can be published later by pushing its tag on the merge commit that brought it.

The promotion check and the release are workflows every repository of the suite shares, kept in
[sovereignfs/sovereign](https://github.com/sovereignfs/sovereign/tree/main/.github/workflows) and run with the version of
`@sovereignfs/create` that `sovereign.json` pins.

<!-- sovereign:shared:end -->
