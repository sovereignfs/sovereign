# Contributing to **TITLE**

How work gets into `develop`, and from there into `main`. It is the workflow of
[Sovereign](https://github.com/sovereignfs/sovereign/blob/main/CONTRIBUTING.md) itself, so an app made with
`npm create @sovereignfs app` is worked on the same way. The sections above and below the shared one are this app's own (how to set it
up, how it is planned); the shared one is written by `npm create @sovereignfs app sync` and is the same in every app of the suite.

<!-- sovereign:shared:begin -->

## Branches

| Branch    | What it is                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `develop` | The working branch. Every change lands here first. `npm create @sovereignfs app` leaves you on it. It can never be deleted or force-pushed.                        |
| `main`    | What is released. It is **protected**: a change reaches it only through a release pull request from `develop`, never by a push (an administrator may bypass this). |

There are two ways to get a change into `develop`; pick per change:

1. **Directly on `develop`.** Commit on an up-to-date `develop` and push it. Suits small, low-risk changes by a maintainer.

   ```bash
   git switch develop && git pull
   # edit, commit
   git push origin develop
   ```

2. **A feature branch.** Branch from an up-to-date `develop`, open a draft pull request **into `develop`**, and merge it with
   **rebase and merge** once it is reviewed. Suits anything that wants review, and every outside contribution.

   ```bash
   git switch develop && git pull
   git switch -c feat/your-feature-name
   ```

   Name a branch by its change: `feat/`, `fix/`, `docs/` or `chore/`, then a short slug.

Either way, a commit explains _why_, not only _what_: a subject under 72 characters such as `fix: end the session after sign-out`, and a
body that says what was checked. Pull requests into `develop` are merged with **rebase and merge**, never squashed and never with a merge
commit; fix commit messages before they reach `develop`, which is never rewritten.

## Continuous integration

CI runs only where a change is about to reach what is released:

- on a pull request into `main` that is not a draft (the promotion from `develop`); marking a draft ready for review runs it;
- before each release is published (the publish workflow runs the checks on the tagged commit);
- by hand, for any branch: **Actions → CI → Run workflow**.

It never runs on a push to `develop` or a feature branch, nor on a pull request into `develop`, so runner time is not spent on every
commit. Those are checked on your machine instead: where the repository has versioned hooks in `.githooks/` (an app's `__INSTALL__` turns
them on), the pre-push hook runs its checks (`__RUN__ verify`) before anything is pushed. This is the CI strategy of every repository of
the suite.

## Promoting `develop` into `main`

`main` changes only through a promotion pull request from `develop`, merged with **a merge commit**, the one place a merge commit is
used; `develop` is never rewritten, so it stays an ancestor of `main` and the next promotion shows only what is new. Its title is the
version, **`vX.Y.Z`**, or **`Release vX.Y.Z`** when merging it is to publish that version, which [RELEASING.md](RELEASING.md) describes:
there is no release script, and no tag to push by hand.

The **Promotion** check, which `main` requires, holds the title to the code, refuses a commit whose agent trailer names a model, and
fails when a shared file differs from the template (below). Editing the title runs it again.

Once the promotion is merged, `.github/workflows/sync-develop.yml` moves `develop` forward to the merge commit. It is a fast-forward,
never a rewrite (`develop` is already in the merge commit's history), so `develop` is not shown as behind `main` and the release tags are
in its history. If a commit reached `develop` after the merge, the run leaves `develop` as it is and says so; pull before you start new
work either way.

## Shared files

Some files are the same in every app of the suite and are written, not edited: `.github/workflows/promotion.yml`, `release.yml` and
`sync-develop.yml`, `.github/repository.json`, `CLAUDE.md`, the `Dockerfile`, `.dockerignore` and `compose.yml`, and the shared sections of this file, `RELEASING.md` and `AGENTS.md`. They come
from the template of the version of `@sovereignfs/create` that `package.json` pins:

```bash
npm create @sovereignfs app sync           # write them from the pinned version's template
npm create @sovereignfs app sync --check   # say which differ, and fail; the Promotion check runs this
```

To change one, change it in the template, in [sovereignfs/sovereign](https://github.com/sovereignfs/sovereign), and take it here by moving
the pin and running `sync`. A file this app keeps as its own is listed in `package.json` under `sovereign.unmanaged`, by its path from the
repository's root, and the check then leaves it alone.

## Repository settings

The repository's merge settings and its rulesets (what `main` and `develop` allow, and the checks `main` requires) are code, in
`.github/repository.json`, and are never set in GitHub's interface. Once the repository is on GitHub, push both branches and apply them,
signed in with `gh` as an owner of the repository:

```bash
git push -u origin main develop
npm create @sovereignfs app settings apply   # make GitHub match .github/repository.json
npm create @sovereignfs app settings check   # say what differs, and fail
```

`main` takes changes only by pull request, merged with a merge commit, and requires the Promotion check and the checks under
`sovereign.requiredChecks` in `package.json` (`requiredChecks` in `sovereign.json` for a repository of several components); `develop` can never be deleted or force-pushed, so merging a promotion (which would
otherwise delete its head branch) leaves it in place. A change to the settings is a commit like any other, applied after it lands.

<!-- sovereign:shared:end -->
