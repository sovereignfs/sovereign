# @sovereignfs/create

[![npm](https://img.shields.io/npm/v/@sovereignfs/create?label=npm)](https://www.npmjs.com/package/@sovereignfs/create) [![licence](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](https://github.com/sovereignfs/sovereign/blob/main/LICENSE)

`npm create @sovereignfs` makes an instance repository for [Sovereign](https://github.com/sovereignfs/sovereign): a folder with a
`./sv` launcher and a `package.json` that pins `@sovereignfs/cli` of the same version as this package.

```bash
npm create @sovereignfs my-instance
```

Then `./sv setup`. `npm create @sovereignfs app my-notes` makes a Next.js app that an instance can host as it stands: it signs in through
the instance's core, keeps its data in its own database, and builds into an image whose label is its manifest. It is made with pnpm unless
`--package-manager npm` or `--package-manager yarn` says otherwise. With `--encryption`, its
notes are encrypted in the browser and shared between people of the instance (not yet audited; see its `ENCRYPTION.md`). See [`@sovereignfs/cli`](https://www.npmjs.com/package/@sovereignfs/cli). Licence: AGPL-3.0-or-later.

Once an app exists, it keeps the files every app of the suite shares (its release workflows, repository settings, contributing and
release guides, its `Dockerfile`, `.dockerignore` and `compose.yml`, and the shared section of `AGENTS.md`) with the version of this package it pins:

```bash
npm create @sovereignfs app sync           # write them from this version's template
npm create @sovereignfs app sync --check   # say which differ, and fail
npm create @sovereignfs app settings apply # make GitHub's settings and rulesets match .github/repository.json
```

`app release check`, `app release notes` and `app commits check` are what its promotion check and release run.
