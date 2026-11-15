# Contributing to **TITLE**

How work gets into `develop`, and from there into `main`. It is the workflow of
[Sovereign](https://github.com/sovereignfs/sovereign/blob/main/CONTRIBUTING.md) itself, so an app made with
`npm create @sovereignfs app` is worked on the same way.

## Branches

| Branch    | What it is                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `develop` | The working branch. Every change lands here first. `npm create @sovereignfs app` leaves you on it.                                                                 |
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

CI (`.github/workflows/ci.yml`: typecheck, the manifest check, the build) runs only where a change is about to reach what is
released:

- on a pull request into `main` that is not a draft (the promotion from `develop`); marking a draft ready for review runs it;
- on each release tag, before the image is built (`.github/workflows/publish.yml` calls it);
- by hand, for any branch: **Actions → CI → Run workflow**.

It never runs on a push to `develop` or a feature branch, nor on a pull request into `develop`, so runner time is not spent on every
commit. Those are checked on your machine instead: `npm install` turns on the versioned hooks in `.githooks/`, and the pre-push hook runs
`npm run verify` (typecheck and the manifest check) before anything is pushed. This is the CI strategy of every Sovereign app.

## Promoting `develop` into `main`

1. Set the new version in `package.json` on `develop` (semver: a fix is a patch, a feature a minor, a break a major).
2. Open a pull request from `develop` into `main`. Its title is the version, **`vX.Y.Z`**, or **`Release vX.Y.Z`** when that version
   will be tagged and published once it is merged; not every version is. The body lists what it carries.
3. Merge it with **a merge commit**, the one place a merge commit is used; the merge commit takes the pull request's title.
   `develop` is never rewritten, so it stays an ancestor of `main` and the next pull request shows only what is new.
4. To publish, tag the merge commit and push the tag, which builds and publishes the image (`.github/workflows/publish.yml`):

   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

   A tag is not a branch, so `main`'s protection does not stop it; the workflow refuses a tag whose commit is not on `main`, or whose
   version is not the one in `package.json`.

Once the promotion is merged, `.github/workflows/sync-develop.yml` moves `develop` forward to the merge commit. It is a fast-forward,
never a rewrite (`develop` is already in the merge commit's history), so `develop` is not shown as behind `main` and the release tags are
in its history. If a commit reached `develop` after the merge, the run leaves `develop` as it is and says so; pull before you start new
work either way.

## Setting it up on GitHub

Once the repository is on GitHub, push both branches and protect `main`:

```bash
git push -u origin main develop
```

Then, in **Settings → Rules → Rulesets**, add a ruleset for the default branch `main` that requires a pull request before merging, allows
merge commits, and blocks force pushes and deletion, with the Repository admin role allowed to bypass it. In **Settings → General → Pull
Requests**, keep merge commits and rebase merging allowed, and set the default merge commit message to the pull request's title and
description, so the merge commit reads `vX.Y.Z` or `Release vX.Y.Z`.
