# @sovereignfs/create

[![npm](https://img.shields.io/npm/v/@sovereignfs/create?label=npm)](https://www.npmjs.com/package/@sovereignfs/create) [![licence](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](https://github.com/sovereignfs/sovereign/blob/main/LICENSE)

`npm create @sovereignfs` makes an instance repository for [Sovereign](https://github.com/sovereignfs/sovereign): a folder with a
`./sv` launcher and a `package.json` that pins `@sovereignfs/cli` of the same version as this package.

```bash
npm create @sovereignfs my-instance
```

Then `./sv setup`. `npm create @sovereignfs app my-notes` makes a Next.js app that an instance can host as it stands: it signs in through
the instance's core, keeps its data in its own database, and builds into an image whose label is its manifest. See [`@sovereignfs/cli`](https://www.npmjs.com/package/@sovereignfs/cli). Licence: AGPL-3.0-or-later.
